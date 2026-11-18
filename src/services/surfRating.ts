export interface SpotConfig {
  id: string;
  name: string;
  zone: string;
  lat: number;
  lon: number;
  idealSwellDeg: number;
  offshoreWindDeg: number;
  camUrl?: string;
}

export interface HourlyConditions {
  waveHeight: number;     // metros
  wavePeriod: number;     // segundos
  waveDirection: number;  // grados (de dónde viene)
  windSpeed: number;      // km/h
  windDirection: number;  // grados (de dónde viene)
}

export interface SurfRatingResult {
  stars: number; // 1 a 5
  windQuality: 'offshore' | 'cross' | 'onshore';
  energyScore: number;
}

function angularDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function calculateSurfRating(
  cond: HourlyConditions,
  spot: SpotConfig
): SurfRatingResult {
  // 1. Potencia base de la ola (altura^2 * período)
  const rawPower = Math.pow(cond.waveHeight, 2) * cond.wavePeriod;
  let score = Math.min(5, rawPower / 4.5); // Normalizado a escala ~0-5

  // 2. Penalización si la ola es muy chica (< 0.5m) o puro mar de viento (< 7s)
  if (cond.waveHeight < 0.5 || cond.wavePeriod < 7) {
    score *= 0.4;
  }

  // 3. Alineación del swell con la playa
  const swellAngle = angularDiff(cond.waveDirection, spot.idealSwellDeg);
  if (swellAngle > 65) score *= 0.55;
  else if (swellAngle > 35) score *= 0.8;

  // 4. Factor viento (el más determinante)
  const windAngle = angularDiff(cond.windDirection, spot.offshoreWindDeg);
  let windQuality: 'offshore' | 'cross' | 'onshore' = 'cross';

  if (windAngle <= 45) {
    windQuality = 'offshore';
    if (cond.windSpeed >= 6 && cond.windSpeed <= 28) score *= 1.25; // Terral ideal
  } else if (windAngle >= 120) {
    windQuality = 'onshore';
    if (cond.windSpeed > 18) score *= 0.4;       // Mar muy revuelto
    else if (cond.windSpeed > 10) score *= 0.65;
  } else {
    windQuality = 'cross';
    if (cond.windSpeed > 22) score *= 0.7;
  }

  const clampedStars = Math.max(1, Math.min(5, Math.round(score)));

  return {
    stars: cond.waveHeight < 0.35 ? 1 : clampedStars,
    windQuality,
    energyScore: Math.round(rawPower * 10) / 10
  };
}
