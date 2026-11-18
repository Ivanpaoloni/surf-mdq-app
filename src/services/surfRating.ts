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
  // 1. Potencia base (altura^2 * período). 
  // Menos de 0.4m es un lago, arranca en 0 de una.
  if (cond.waveHeight < 0.4) {
    return { stars: 0, windQuality: 'cross', energyScore: 0 };
  }

  const rawPower = Math.pow(cond.waveHeight, 2) * cond.wavePeriod;
  let score = rawPower / 4.5;

  // 2. Alineación del swell (El efecto "escollera/bahía")
  const swellAngle = angularDiff(cond.waveDirection, spot.idealSwellDeg);
  
  if (swellAngle > 80) {
    score *= 0.1; // El swell pasa de largo (casi bloqueado)
  } else if (swellAngle > 55) {
    score *= 0.3; // Entra muy cruzado, pierde mucha fuerza
  } else if (swellAngle > 30) {
    score *= 0.7; // Entra de costado
  }

  // Si después del filtro de ángulo no quedó energía, devolvemos 0
  if (score < 0.8) {
    return { stars: 0, windQuality: 'cross', energyScore: Math.round(rawPower * 10) / 10 };
  }

  // 3. Factor Viento
  const windAngle = angularDiff(cond.windDirection, spot.offshoreWindDeg);
  let windQuality: 'offshore' | 'cross' | 'onshore' = 'cross';

  if (windAngle <= 50) {
    windQuality = 'offshore';
    if (cond.windSpeed >= 5 && cond.windSpeed <= 25) score *= 1.3; // Terral perfecto
  } else if (windAngle >= 120) {
    windQuality = 'onshore';
    if (cond.windSpeed > 18) score *= 0.1;       // Viento fuerte del mar = sopa, 0 estrellas
    else if (cond.windSpeed > 10) score *= 0.4;  // Viento moderado = arruina la forma
  } else {
    windQuality = 'cross';
    if (cond.windSpeed > 20) score *= 0.3;       // Viento cruzado muy fuerte
    else if (cond.windSpeed > 12) score *= 0.7;
  }

  // 4. Redondeo estricto permitiendo el Cero
  // Math.round aproxima al entero más cercano. Min 0, Max 5.
  const finalStars = Math.max(0, Math.min(5, Math.round(score)));

  return {
    stars: finalStars,
    windQuality,
    energyScore: Math.round(rawPower * 10) / 10
  };
}
