export type SwellDirectionQuality = 'good' | 'fair' | 'poor';

export interface WaveEnergyInfo {
  kj: number;
  level: 1 | 2 | 3 | 4;
  label: string;
}

export function getWetsuitRecommendation(waterTemp: number | null | undefined): string | null {
  if (typeof waterTemp !== 'number' || !Number.isFinite(waterTemp)) {
    return null;
  }
  if (waterTemp >= 21) return 'Lycra / Shorty';
  if (waterTemp >= 17) return '3/2 mm';
  if (waterTemp >= 13) return '4/3 mm';
  return '4/3 mm + botitas';
}

export function getSwellDirectionQuality(
  swellDeg: number,
  idealSwellDeg: number
): SwellDirectionQuality {
  if (!Number.isFinite(swellDeg) || !Number.isFinite(idealSwellDeg)) {
    return 'fair';
  }
  const diff = Math.abs(((swellDeg - idealSwellDeg + 540) % 360) - 180);
  if (diff <= 35) return 'good';
  if (diff <= 75) return 'fair';
  return 'poor';
}

export function calculateWaveEnergyKj(height: number, period: number): WaveEnergyInfo {
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const p = Number.isFinite(period) ? Math.max(0, period) : 0;
  const kj = Math.round(1.96 * h * h * p * p);

  if (kj < 100) return { kj, level: 1, label: 'baja' };
  if (kj < 300) return { kj, level: 2, label: 'media' };
  if (kj < 700) return { kj, level: 3, label: 'alta' };
  return { kj, level: 4, label: 'muy alta' };
}

export function getWeatherLabel(code: number | null | undefined): string {
  if (typeof code !== 'number' || !Number.isFinite(code)) {
    return '';
  }
  if (code === 0) return 'Despejado';
  if (code === 1 || code === 2) return 'Algo nublado';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Niebla';
  if (code >= 51 && code <= 57) return 'Llovizna';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Lluvia';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Nieve';
  if (code >= 95 && code <= 99) return 'Tormenta';
  return 'Variable';
}
