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

export interface HourlyConditions {
  waveHeight: number;     // metros
  wavePeriod: number;     // segundos
  waveDirection: number;  // grados (de dónde viene)
  rawWaveHeight?: number; // metros (dato combinado original)
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

function angularDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
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

  // Clasificación direccional del viento
  const windAngle = angularDiff(cond.windDirection, spot.offshoreWindDeg);
  let windQuality: 'offshore' | 'cross' | 'onshore' = 'cross';
  if (windAngle <= 50) windQuality = 'offshore';
  else if (windAngle >= 120) windQuality = 'onshore';

  // 1. Altura efectiva según exposición, orientación y período
  const exposure = spot.exposure ?? 0.85;
  const swellAngle = angularDiff(cond.waveDirection, spot.idealSwellDeg);
  const angleFactor =
    swellAngle <= 75
      ? 1 - (swellAngle / 75) * 0.35
      : Math.max(0.35, 0.65 - ((swellAngle - 75) / 60) * 0.30);
  const periodFactor = Math.max(0.85, Math.min(1.2, 0.85 + (cond.wavePeriod - 6) * 0.04));

  const effectiveHeight = cond.waveHeight * exposure * angleFactor * periodFactor;
  const estimatedHeight = Math.round(effectiveHeight * 10) / 10;
  const { minHeight, maxHeight } = buildHeightRange(effectiveHeight, cond.wavePeriod);

  // Menos de 0.30m efectivos es casi flat
  if (effectiveHeight < 0.30) {
    return {
      stars: 0,
      windQuality,
      energyScore,
      estimatedHeight,
      minHeight,
      maxHeight,
    };
  }

  // 2. Puntaje por tamaño (0 a 3.5 pts, sin crecimiento cuadrático explosivo)
  const sizeScore = Math.min(3.5, Math.max(0, (effectiveHeight - 0.2) * 2.6));

  // 3. Calidad de período (-0.5 a +1.5 pts)
  // < 7s penaliza (chop); 10s = +0.6; 12s = +1.1; >= 14s = +1.5
  const periodScore = Math.max(-0.5, Math.min(1.5, (cond.wavePeriod - 7.5) * 0.25));

  // Potencial de ola acotado a 5 ANTES del viento
  const baseSwellScore = Math.max(0, Math.min(5, sizeScore + periodScore));

  // 4. Factor de viento aplicado sobre el puntaje ya acotado
  let windFactor = 1.0;

  if (cond.windSpeed < 8) {
    // Glassy / calmo: la dirección casi no importa
    windFactor = 1.05;
  } else if (windQuality === 'offshore') {
    if (cond.windSpeed <= 20) windFactor = 1.1;       // Terral limpio
    else if (cond.windSpeed <= 30) windFactor = 0.92; // Terral fuerte
    else windFactor = 0.72;                           // Demasiado fuerte
  } else if (windQuality === 'cross') {
    if (cond.windSpeed <= 14) windFactor = 0.78;
    else if (cond.windSpeed <= 22) windFactor = 0.58;
    else windFactor = 0.35;
  } else {
    // Onshore
    if (cond.windSpeed <= 12) windFactor = 0.55;
    else if (cond.windSpeed <= 20) windFactor = 0.3;
    else windFactor = 0.15;
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