export interface SpotConfig {
  id: string;
  name: string;
  zone: string;
  lat: number;
  lon: number;
  idealSwellDeg: number;
  offshoreWindDeg: number;
  exposure?: number;
  camUrl?: string;
}

export interface SecondarySwellInput {
  height: number;
  period: number;
  direction: number;
  isWindWave?: boolean;
}

export interface HourlyConditions {
  waveHeight: number;     // metros
  wavePeriod: number;     // segundos
  waveDirection: number;  // grados (de dónde viene)
  rawWaveHeight?: number; // metros (dato combinado original)
  secondarySwell?: SecondarySwellInput | null;
  windSpeed: number;      // km/h
  windDirection: number;  // grados (de dónde viene)
}

export interface SurfRatingResult {
  stars: number; // 0 a 5
  windQuality: 'offshore' | 'cross' | 'onshore';
  energyScore: number;
  estimatedHeight: number;
  minHeight: number;
  maxHeight: number;
}

export interface WaveEnergyInfo {
  kj: number;
  level: 1 | 2 | 3 | 4;
  label: string;
}

function angularDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function calcComponentEffectiveHeight(
  height: number,
  period: number,
  direction: number,
  spot: SpotConfig
): number {
  const exposure = spot.exposure ?? 0.85;
  const swellAngle = angularDiff(direction, spot.idealSwellDeg);
  const angleFactor =
    swellAngle <= 75
      ? 1 - (swellAngle / 75) * 0.35
      : Math.max(0.35, 0.65 - ((swellAngle - 75) / 60) * 0.30);
  const periodFactor = Math.max(0.85, Math.min(1.2, 0.85 + (period - 6) * 0.04));

  return height * exposure * angleFactor * periodFactor;
}

export function calculateWaveEnergyKj(
  height: number,
  period: number,
  secondarySwell?: { height: number; period: number } | null
): WaveEnergyInfo {
  const h1 = Number.isFinite(height) ? Math.max(0, height) : 0;
  const p1 = Number.isFinite(period) ? Math.max(0, period) : 0;
  const h2 =
    secondarySwell && Number.isFinite(secondarySwell.height)
      ? Math.max(0, secondarySwell.height)
      : 0;
  const p2 =
    secondarySwell && Number.isFinite(secondarySwell.period)
      ? Math.max(0, secondarySwell.period)
      : 0;

  const kj = Math.round(1.96 * h1 * h1 * p1 * p1 + 1.96 * h2 * h2 * p2 * p2);

  if (kj < 100) return { kj, level: 1, label: 'baja' };
  if (kj < 300) return { kj, level: 2, label: 'media' };
  if (kj < 700) return { kj, level: 3, label: 'alta' };
  return { kj, level: 4, label: 'muy alta' };
}

export function buildHeightRange(
  effectiveHeight: number,
  period: number
): { minHeight: number; maxHeight: number } {
  if (effectiveHeight < 0.15) {
    return { minHeight: 0, maxHeight: 0 };
  }

  const spread = Math.max(0.18, Math.min(0.35, 0.18 + (period - 7) * 0.024));
  const minHeight = Math.round(Math.max(0.1, effectiveHeight * (1 - spread)) * 10) / 10;
  const maxHeight = Math.max(
    Math.round((minHeight + 0.1) * 10) / 10,
    Math.round(effectiveHeight * (1 + spread) * 10) / 10
  );

  return { minHeight, maxHeight };
}

export function calculateSurfRating(
  cond: HourlyConditions,
  spot: SpotConfig
): SurfRatingResult {
  const rawPower = Math.pow(cond.waveHeight, 2) * cond.wavePeriod;
  const energyScore = Math.round(rawPower * 10) / 10;

  // Clasificación direccional del viento (cono Offshore estable <= 55°, Cross <= 115°, Onshore > 115°)
  const windAngle = angularDiff(cond.windDirection, spot.offshoreWindDeg);
  let windQuality: 'offshore' | 'cross' | 'onshore' = 'cross';
  if (windAngle <= 55) windQuality = 'offshore';
  else if (windAngle > 115) windQuality = 'onshore';

  // 1. Altura efectiva considerando exposición, orientación, período y aporte del swell secundario
  const primaryEffective = calcComponentEffectiveHeight(
    cond.waveHeight,
    cond.wavePeriod,
    cond.waveDirection,
    spot
  );

  let effectiveHeight = primaryEffective;
  let effectivePeriod = cond.wavePeriod;

  if (cond.secondarySwell && cond.secondarySwell.height > 0) {
    const secondaryEffective = calcComponentEffectiveHeight(
      cond.secondarySwell.height,
      cond.secondarySwell.period,
      cond.secondarySwell.direction,
      spot
    );
    effectiveHeight = Math.hypot(primaryEffective, secondaryEffective);
    if (secondaryEffective > primaryEffective && cond.secondarySwell.period > 0) {
      effectivePeriod = cond.secondarySwell.period;
    }
  }

  const estimatedHeight = Math.round(effectiveHeight * 10) / 10;
  const { minHeight, maxHeight } = buildHeightRange(effectiveHeight, effectivePeriod);

  // Menos de 0.28m efectivos es flat / muy chico
  if (effectiveHeight < 0.28) {
    return {
      stars: 0,
      windQuality,
      energyScore,
      estimatedHeight,
      minHeight,
      maxHeight,
    };
  }

  // 2. Puntaje por tamaño calibrado para la costa bonaerense (0 a 3.6 pts)
  const sizeScore = Math.min(3.6, Math.max(0, 0.5 + (effectiveHeight - 0.28) * 2.5));

  // 3. Calidad de período (-0.2 a +1.4 pts, suave en 6s-8s y premia swells limpios >= 10s)
  const periodScore = Math.max(-0.2, Math.min(1.4, (effectivePeriod - 6.5) * 0.18));

  // Potencial de ola acotado a 5 ANTES del viento
  const baseSwellScore = Math.max(0, Math.min(5, sizeScore + periodScore));

  // 4. Factor de viento: premia claramente offshore suave frente a onshore
  let windFactor = 1.0;

  if (cond.windSpeed < 7) {
    // Glassy / calmo
    windFactor = 1.18;
  } else if (windQuality === 'offshore') {
    if (cond.windSpeed <= 18) windFactor = 1.28;       // Terral limpio
    else if (cond.windSpeed <= 28) windFactor = 1.05;  // Terral moderado/fuerte
    else windFactor = 0.80;                            // Demasiado fuerte
  } else if (windQuality === 'cross') {
    if (cond.windSpeed <= 14) windFactor = 0.88;
    else if (cond.windSpeed <= 22) windFactor = 0.68;
    else windFactor = 0.42;
  } else {
    // Onshore
    if (cond.windSpeed <= 12) windFactor = 0.52;
    else if (cond.windSpeed <= 20) windFactor = 0.36;
    else windFactor = 0.22;
  }

  const finalScore = baseSwellScore * windFactor;
  const finalStars = Math.max(0, Math.min(5, Math.round(finalScore)));

  return {
    stars: finalStars,
    windQuality,
    energyScore,
    estimatedHeight,
    minHeight,
    maxHeight,
  };
}
