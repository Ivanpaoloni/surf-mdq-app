import type { ForecastData } from './openMeteo';

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

export type Spot = SpotConfig;

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
  windGusts?: number | null; // km/h
}

export type WindQuality = 'calm' | 'offshore' | 'cross' | 'onshore';

export interface SurfRatingResult {
  stars: number; // 0 a 5
  windQuality: WindQuality;
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

export interface SessionHourInput extends HourlyConditions {
  time: string;
  isNight?: boolean;
  primarySwell?: { height: number; period: number; direction: number } | null;
}

export interface BestSessionWindow {
  startTime: string;
  endTime: string;
  stars: number;
  windQuality: WindQuality | null;
  hourCount: number;
}

function angularDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function isSameSwellComponent(
  a: { height: number; period: number; direction: number },
  b: { height: number; period: number; direction: number }
): boolean {
  return (
    Math.abs(a.height - b.height) <= 0.1 &&
    Math.abs(a.period - b.period) <= 1 &&
    angularDiff(a.direction, b.direction) <= 15
  );
}

export type SwellDirectionQuality = 'good' | 'fair' | 'poor';

/**
 * Factor continuo de exposición direccional de un swell respecto a la orientación ideal del spot,
 * incorporando refracción por período y abrigo del spot en ángulos abiertos:
 * - Zona óptima (diff <= 40°): 1.0 (sin atenuación)
 * - Transición (40° < effectiveDiff <= 115°): caída suave tipo coseno modulada por período y abrigo
 * - Zona bloqueada (effectiveDiff > 115°): piso mínimo (0.05 en período corto, 0.08–0.10 en largo)
 */
export function getSwellExposureFactor(
  swellDirection: number,
  swellPeriod: number,
  spot: SpotConfig
): number {
  if (!Number.isFinite(swellDirection) || !Number.isFinite(spot.idealSwellDeg)) {
    return 0.55;
  }

  const diff = angularDiff(swellDirection, spot.idealSwellDeg);
  if (diff <= 40) return 1.0;

  const p = Number.isFinite(swellPeriod) && swellPeriod > 0 ? swellPeriod : 8.5;

  // Refracción según período: swells >= 10s extienden el ángulo efectivo (+6° a +10°);
  // mar de viento <= 7s recorta (-8° a -10°)
  let periodShiftDeg: number;
  if (p >= 10) {
    periodShiftDeg = 6 + Math.min(1, (p - 10) / 4) * 4;
  } else if (p <= 7) {
    periodShiftDeg = -8 - Math.min(1, (7 - p) / 2) * 2;
  } else {
    periodShiftDeg = -8 + ((p - 7) / 3) * 14;
  }

  // Piso mínimo por refracción según período
  let floorVal: number;
  if (p >= 10) {
    floorVal = 0.08 + Math.min(1, (p - 10) / 4) * 0.02;
  } else if (p <= 7) {
    floorVal = 0.05;
  } else {
    floorVal = 0.05 + ((p - 7) / 3) * 0.03;
  }

  const effectiveDiff = Math.max(40, diff - periodShiftDeg);
  let baseFactor: number;

  if (effectiveDiff <= 40) {
    baseFactor = 1.0;
  } else if (effectiveDiff <= 115) {
    const t = (effectiveDiff - 40) / 75;
    const smoothFalloff = Math.pow(1 - t, 1.15);
    baseFactor = floorVal + (1 - floorVal) * smoothFalloff;
  } else {
    baseFactor = floorVal;
  }

  // Abrigo del spot en ángulos abiertos (diff > 60°): spots más cerrados atenúan más
  if (diff > 60) {
    const exposure = spot.exposure ?? 0.85;
    const opennessWeight = Math.min(1, (diff - 60) / 35);
    const shelterMultiplier = 1 - opennessWeight * (1 - exposure) * 0.55;
    return Math.max(floorVal, baseFactor * shelterMultiplier);
  }

  return Math.max(floorVal, baseFactor);
}

/**
 * Clasificación visual de la dirección del swell unificada con getSwellExposureFactor:
 * - Verde ('good'): factor >= 0.72
 * - Amarillo ('fair'): 0.25 <= factor < 0.72
 * - Rojo ('poor'): factor < 0.25
 */
export function getSwellDirectionQualityForSpot(
  swellDirection: number,
  swellPeriod: number,
  spot: SpotConfig
): SwellDirectionQuality {
  const factor = getSwellExposureFactor(swellDirection, swellPeriod, spot);
  if (factor >= 0.72) return 'good';
  if (factor >= 0.25) return 'fair';
  return 'poor';
}

function getWaveEnergyInfoFromKj(kj: number): WaveEnergyInfo {
  const rounded = Math.max(0, Math.round(kj));
  if (rounded < 100) return { kj: rounded, level: 1, label: 'baja' };
  if (rounded < 300) return { kj: rounded, level: 2, label: 'media' };
  if (rounded < 700) return { kj: rounded, level: 3, label: 'alta' };
  return { kj: rounded, level: 4, label: 'muy alta' };
}

function calcComponentEffectiveHeight(
  height: number,
  period: number,
  direction: number,
  spot: SpotConfig
): number {
  const exposure = spot.exposure ?? 0.85;
  const dirHeightFactor = Math.sqrt(getSwellExposureFactor(direction, period, spot));
  const periodFactor = Math.max(0.85, Math.min(1.2, 0.85 + (period - 6) * 0.04));

  return height * exposure * dirHeightFactor * periodFactor;
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
  return getWaveEnergyInfoFromKj(kj);
}

/**
 * Energía efectiva (en kJ) ponderada por exposición direccional, período y abrigo del spot,
 * sumando Swell 1 y (si existe y es distinto) Swell 2.
 */
export function calculateEffectiveEnergy(
  item: Pick<
    SessionHourInput,
    'waveHeight' | 'wavePeriod' | 'waveDirection' | 'primarySwell' | 'secondarySwell'
  >,
  spot: SpotConfig
): number {
  const swell1 = item.primarySwell ?? {
    height: item.waveHeight,
    period: item.wavePeriod,
    direction: item.waveDirection,
  };

  const h1 = Number.isFinite(swell1.height) ? Math.max(0, swell1.height) : 0;
  const p1 = Number.isFinite(swell1.period) ? Math.max(0, swell1.period) : 0;
  const e1 =
    1.96 * h1 * h1 * p1 * p1 * getSwellExposureFactor(swell1.direction, p1, spot);

  let e2 = 0;
  const swell2 = item.secondarySwell ?? null;
  if (swell2 && !isSameSwellComponent(swell1, swell2)) {
    const h2 = Number.isFinite(swell2.height) ? Math.max(0, swell2.height) : 0;
    const p2 = Number.isFinite(swell2.period) ? Math.max(0, swell2.period) : 0;
    if (h2 > 0 && p2 > 0) {
      e2 =
        1.96 * h2 * h2 * p2 * p2 * getSwellExposureFactor(swell2.direction, p2, spot);
    }
  }

  return Math.round(e1 + e2);
}

export function calculateEffectiveEnergyInfo(
  item: Pick<
    SessionHourInput,
    'waveHeight' | 'wavePeriod' | 'waveDirection' | 'primarySwell' | 'secondarySwell'
  >,
  spot: SpotConfig
): WaveEnergyInfo {
  return getWaveEnergyInfoFromKj(calculateEffectiveEnergy(item, spot));
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

  // Clasificación direccional del viento:
  // - <= 6 km/h: Calmo (siempre favorable/verde, nunca Onshore rojo)
  // - Offshore puro <= 35°, Cross 36°..115°, Onshore > 115°
  const windAngle = angularDiff(cond.windDirection, spot.offshoreWindDeg);
  let windQuality: WindQuality = 'cross';
  if (cond.windSpeed <= 6) windQuality = 'calm';
  else if (windAngle <= 35) windQuality = 'offshore';
  else if (windAngle > 115) windQuality = 'onshore';

  // 1. Altura efectiva considerando exposición, orientación direccional, período y aporte del swell secundario
  const primaryComp = {
    height: cond.waveHeight,
    period: cond.wavePeriod,
    direction: cond.waveDirection,
  };
  const primaryExposure = getSwellExposureFactor(cond.waveDirection, cond.wavePeriod, spot);
  const primaryEffective = calcComponentEffectiveHeight(
    cond.waveHeight,
    cond.wavePeriod,
    cond.waveDirection,
    spot
  );

  let effectiveHeight = primaryEffective;
  let effectivePeriod = cond.wavePeriod;
  let effectiveEnergyKj =
    1.96 * cond.waveHeight * cond.waveHeight * cond.wavePeriod * cond.wavePeriod * primaryExposure;

  if (
    cond.secondarySwell &&
    cond.secondarySwell.height > 0 &&
    !isSameSwellComponent(primaryComp, cond.secondarySwell)
  ) {
    const secondaryExposure = getSwellExposureFactor(
      cond.secondarySwell.direction,
      cond.secondarySwell.period,
      spot
    );
    const secondaryEffective = calcComponentEffectiveHeight(
      cond.secondarySwell.height,
      cond.secondarySwell.period,
      cond.secondarySwell.direction,
      spot
    );
    effectiveHeight = Math.hypot(primaryEffective, secondaryEffective);
    effectiveEnergyKj +=
      1.96 *
      cond.secondarySwell.height *
      cond.secondarySwell.height *
      cond.secondarySwell.period *
      cond.secondarySwell.period *
      secondaryExposure;
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

  // 4. Factor de viento: premia calmo/offshore limpio y penaliza viento sostenido > 20 km/h y ráfagas > 35 km/h
  let windFactor = 1.0;

  if (windQuality === 'calm' || cond.windSpeed < 7) {
    // Glassy / calmo
    windFactor = 1.18;
  } else if (windQuality === 'offshore') {
    if (cond.windSpeed <= 18) windFactor = 1.28;       // Terral limpio
    else if (cond.windSpeed <= 20) windFactor = 1.15;  // Terral moderado
    else if (cond.windSpeed <= 28) windFactor = 0.95;  // Terral fuerte
    else windFactor = 0.72;                            // Terral muy fuerte
  } else if (windQuality === 'cross') {
    if (cond.windSpeed <= 14) windFactor = 0.88;
    else if (cond.windSpeed <= 20) windFactor = 0.70;
    else if (cond.windSpeed <= 26) windFactor = 0.50;
    else windFactor = 0.36;
  } else {
    // Onshore
    if (cond.windSpeed <= 12) windFactor = 0.52;
    else if (cond.windSpeed <= 20) windFactor = 0.36;
    else windFactor = 0.22;
  }

  // Penalización progresiva por viento sostenido > 20 km/h y ráfagas > 35 km/h (más estricta en mar chico < 90 kJ)
  const gusts =
    typeof cond.windGusts === 'number' && Number.isFinite(cond.windGusts)
      ? cond.windGusts
      : cond.windSpeed;
  const isLowEnergy = effectiveEnergyKj < 90;

  if (cond.windSpeed > 20) {
    const windExcess = Math.min(20, cond.windSpeed - 20);
    const sustainedPenalty = Math.max(
      0.55,
      1 - windExcess * (isLowEnergy ? 0.025 : 0.012)
    );
    windFactor *= sustainedPenalty;
  }

  if (gusts > 35) {
    const gustExcess = Math.min(25, gusts - 35);
    const gustPenalty = Math.max(
      0.5,
      1 - gustExcess * (isLowEnergy ? 0.03 : 0.012)
    );
    windFactor *= gustPenalty;
  }

  const finalScore = baseSwellScore * windFactor;
  let finalStars = Math.max(0, Math.min(5, Math.round(finalScore)));

  const roundedEnergyKj = Math.round(effectiveEnergyKj);

  // Un swell en dirección bloqueada/roja con energía efectiva < 45 kJ no puede ser "Surfeable" (2★+)
  if (primaryExposure < 0.25 && roundedEnergyKj < 45) {
    finalStars = Math.min(finalStars, 1);
  }

  // Techos realistas de estrellas para olas muy chicas (un buen viento no puede inflar días casi plato)
  if (effectiveHeight < 0.35 || roundedEnergyKj < 25) {
    finalStars = Math.min(finalStars, 1);
  } else if (effectiveHeight < 0.55 && roundedEnergyKj < 85) {
    finalStars = Math.min(finalStars, 2);
  }

  return {
    stars: finalStars,
    windQuality,
    energyScore,
    estimatedHeight,
    minHeight,
    maxHeight,
  };
}

function formatOffsetIsoHour(isoTime: string, addHours: number): string {
  const dt = new Date(isoTime);
  if (Number.isNaN(dt.getTime())) return isoTime;
  dt.setHours(dt.getHours() + addHours);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function findBestSessionWindow(
  dayHours: SessionHourInput[],
  spot: SpotConfig,
  isToday: boolean,
  nowMs: number = Date.now()
): BestSessionWindow | null {
  const currentHourStart = new Date(nowMs);
  currentHourStart.setMinutes(0, 0, 0);
  const cutoffMs = currentHourStart.getTime();

  const rated = dayHours
    .map((hour) => {
      const ms = new Date(hour.time).getTime();
      const h = new Date(hour.time).getHours();
      const isNight = hour.isNight ?? (h < 6 || h >= 20);
      return { hour, ms, isNight };
    })
    .filter(({ ms, isNight }) => {
      if (!Number.isFinite(ms) || isNight) return false;
      if (isToday && ms < cutoffMs) return false;
      return true;
    })
    .sort((a, b) => a.ms - b.ms)
    .map(({ hour, ms }) => {
      const rating = calculateSurfRating(hour, spot);
      const energyKj = calculateEffectiveEnergy(hour, spot);
      const windRank =
        rating.windQuality === 'calm' || rating.windQuality === 'offshore'
          ? 3
          : rating.windQuality === 'cross'
            ? 2
            : 1;

      return { hour, ms, rating, energyKj, windRank };
    });

  if (rated.length === 0) return null;

  // Regla de credibilidad: no recomendar ventanas en días flat o < 2★
  const maxDayStars = rated.reduce((max, r) => Math.max(max, r.rating.stars), 0);
  if (maxDayStars < 2) return null;

  interface Candidate {
    startIdx: number;
    length: number;
    avgStars: number;
    avgWindRank: number;
    avgEnergy: number;
  }

  let best: Candidate | null = null;
  const ONE_HOUR_MS = 60 * 60 * 1000;

  for (const length of [3, 2, 1]) {
    for (let i = 0; i <= rated.length - length; i++) {
      let valid = true;
      let sumStars = 0;
      let sumWind = 0;
      let sumEnergy = 0;

      for (let j = 0; j < length; j++) {
        const entry = rated[i + j];
        if (entry.rating.stars < 2) {
          valid = false;
          break;
        }
        if (j > 0 && entry.ms - rated[i + j - 1].ms !== ONE_HOUR_MS) {
          valid = false;
          break;
        }
        sumStars += entry.rating.stars;
        sumWind += entry.windRank;
        sumEnergy += entry.energyKj;
      }

      if (!valid) continue;

      const candidate: Candidate = {
        startIdx: i,
        length,
        avgStars: Math.round((sumStars / length) * 100) / 100,
        avgWindRank: Math.round((sumWind / length) * 100) / 100,
        avgEnergy: sumEnergy / length,
      };

      if (!best) {
        best = candidate;
        continue;
      }

      const isBetter =
        candidate.avgStars !== best.avgStars
          ? candidate.avgStars > best.avgStars
          : candidate.avgWindRank !== best.avgWindRank
            ? candidate.avgWindRank > best.avgWindRank
            : candidate.length !== best.length
              ? candidate.length > best.length
              : candidate.avgEnergy > best.avgEnergy;

      if (isBetter) {
        best = candidate;
      }
    }
  }

  if (!best) return null;

  const slice = rated.slice(best.startIdx, best.startIdx + best.length);
  const first = slice[0];
  const last = slice[slice.length - 1];
  const uniqueWinds = new Set(slice.map((s) => s.rating.windQuality));
  const windQuality = uniqueWinds.size === 1 ? first.rating.windQuality : null;

  return {
    startTime: first.hour.time,
    endTime: formatOffsetIsoHour(last.hour.time, 1),
    stars: Math.round(best.avgStars),
    windQuality,
    hourCount: best.length,
  };
}

export interface DailySummary {
  dayKey: string;
  shortLabel: string;
  dayNumber: string;
  maxStars: number;
  swellHeight: number;
  windQuality: WindQuality;
  isBestDay: boolean;
}

const SHORT_WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function findCurrentHourIndex(
  forecast: ForecastData[],
  now: Date | number = new Date()
): number {
  if (forecast.length === 0) return -1;

  const nowMs = now instanceof Date ? now.getTime() : now;
  let lastIdx = -1;

  for (let i = 0; i < forecast.length; i++) {
    const ts = new Date(forecast[i].time).getTime();
    if (Number.isFinite(ts) && ts <= nowMs) {
      lastIdx = i;
    }
  }

  return lastIdx === -1 ? 0 : lastIdx;
}

function getRepresentativeDisplayHeight(
  hour: ForecastData,
  spot: SpotConfig
): number {
  const swell1 = hour.primarySwell ?? {
    height: hour.waveHeight,
    period: hour.wavePeriod,
    direction: hour.waveDirection,
  };
  const swell1Factor = getSwellExposureFactor(swell1.direction, swell1.period, spot);

  // Si Swell 1 es favorable (verde), mostrar su altura directa del modelo
  if (swell1Factor >= 0.72) {
    return swell1.height;
  }

  // Si Swell 1 está atenuado (amarillo o rojo), usar su altura efectiva direccional
  // (o la del Swell 2 si aporta más que Swell 1)
  const eff1 = swell1.height * Math.sqrt(swell1Factor);
  const swell2 = hour.secondarySwell ?? null;
  if (swell2 && swell2.height >= 0.3 && !isSameSwellComponent(swell1, swell2)) {
    const swell2Factor = getSwellExposureFactor(swell2.direction, swell2.period, spot);
    const eff2 = swell2.height * Math.sqrt(swell2Factor);
    if (eff2 > eff1) {
      return swell2Factor >= 0.72 ? swell2.height : eff2;
    }
  }

  return eff1;
}

export function buildDailySummaries(
  forecast: ForecastData[],
  spot: SpotConfig,
  maxDays = 5,
  nowMs: number = Date.now(),
  visibleDayKeys?: string[],
  currentHourTime?: string | null
): DailySummary[] {
  if (!forecast || forecast.length === 0) return [];

  const now = new Date(nowMs);
  const resolvedCurrentTime =
    currentHourTime ??
    (() => {
      const idx = findCurrentHourIndex(forecast, nowMs);
      return idx >= 0 ? forecast[idx].time : null;
    })();
  const resolvedCurrentMs = resolvedCurrentTime
    ? new Date(resolvedCurrentTime).getTime()
    : NaN;
  const fallbackHourStart = new Date(nowMs);
  fallbackHourStart.setMinutes(0, 0, 0);
  const todayCutoffMs = Number.isFinite(resolvedCurrentMs)
    ? resolvedCurrentMs
    : fallbackHourStart.getTime();

  // Días de referencia para "Hoy" y "Mañana"
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  // Obtener los días calendario únicos en orden cronológico (máximo maxDays)
  let targetDayKeys: string[];
  if (visibleDayKeys) {
    targetDayKeys = Array.from(new Set(visibleDayKeys)).slice(0, maxDays);
  } else {
    const upcomingForecast = forecast.filter(
      (item) => new Date(item.time).getTime() >= todayCutoffMs
    );
    const dayKeySet = new Set<string>();
    targetDayKeys = [];
    for (const item of upcomingForecast) {
      const dk = item.time.slice(0, 10);
      if (!dayKeySet.has(dk)) {
        dayKeySet.add(dk);
        targetDayKeys.push(dk);
        if (targetDayKeys.length >= maxDays) break;
      }
    }
  }

  if (targetDayKeys.length === 0) return [];

  interface InterimDayData {
    dayKey: string;
    shortLabel: string;
    dayNumber: string;
    maxStars: number;
    swellHeight: number;
    windQuality: WindQuality;
    repWindRank: number;
    repEnergyKj: number;
  }

  const interimDays: InterimDayData[] = targetDayKeys.map((dayKey) => {
    // Label y número de día
    const parts = dayKey.split('-').map(Number);
    const dayNumber = String(parts[2]);
    let shortLabel: string;
    if (dayKey === todayKey) {
      shortLabel = 'Hoy';
    } else if (dayKey === tomorrowKey) {
      shortLabel = 'Mañ';
    } else {
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      shortLabel = SHORT_WEEKDAYS[dt.getDay()] ?? '';
    }

    const fullDayHours = forecast.filter((item) => item.time.slice(0, 10) === dayKey);
    const isToday = dayKey === todayKey;

    // Para hoy, solo desde la hora actual en adelante
    const validDayHours = isToday
      ? fullDayHours.filter((item) => new Date(item.time).getTime() >= todayCutoffMs)
      : fullDayHours;

    const isNightHour = (item: ForecastData) => {
      const h = new Date(item.time).getHours();
      return item.isNight ?? (h < 6 || h >= 20);
    };

    const daylightHours = validDayHours.filter((item) => !isNightHour(item));
    // Si solo quedan horas nocturnas visibles, usar esas como fallback
    const candidateHours = daylightHours.length > 0 ? daylightHours : validDayHours;

    const ratedCandidates = candidateHours.map((hour) => {
      const rating = calculateSurfRating(hour, spot);
      const swell1 = hour.primarySwell ?? {
        height: hour.waveHeight,
        period: hour.wavePeriod,
        direction: hour.waveDirection,
      };
      const energyKj = calculateEffectiveEnergy(hour, spot);
      const windRank =
        rating.windQuality === 'calm' || rating.windQuality === 'offshore'
          ? 3
          : rating.windQuality === 'cross'
            ? 2
            : 1;
      return { hour, rating, swell1, energyKj, windRank };
    });

    const maxStars =
      ratedCandidates.length > 0
        ? ratedCandidates.reduce((max, r) => Math.max(max, r.rating.stars), 0)
        : 0;

    // Mejor ventana de sesión diurna
    const bestWindow = findBestSessionWindow(fullDayHours, spot, isToday, todayCutoffMs);

    let repSwellHeight = 0;
    let repWindQuality: WindQuality = 'cross';
    let repWindRank = 2;
    let repEnergyKj = 0;

    if (bestWindow) {
      const windowHours = fullDayHours.filter(
        (h) => h.time >= bestWindow.startTime && h.time < bestWindow.endTime
      );
      const windowRated = (windowHours.length > 0 ? windowHours : fullDayHours).map((hour) => {
        const rating = calculateSurfRating(hour, spot);
        const swell1 = hour.primarySwell ?? {
          height: hour.waveHeight,
          period: hour.wavePeriod,
          direction: hour.waveDirection,
        };
        const energyKj = calculateEffectiveEnergy(hour, spot);
        const windRank =
          rating.windQuality === 'calm' || rating.windQuality === 'offshore'
            ? 3
            : rating.windQuality === 'cross'
              ? 2
              : 1;
        return { hour, rating, swell1, energyKj, windRank };
      });

      windowRated.sort((a, b) => {
        if (b.rating.stars !== a.rating.stars) return b.rating.stars - a.rating.stars;
        if (b.windRank !== a.windRank) return b.windRank - a.windRank;
        return b.energyKj - a.energyKj;
      });

      const top = windowRated[0];
      repSwellHeight = getRepresentativeDisplayHeight(top.hour, spot);
      repWindQuality = bestWindow.windQuality ?? top.rating.windQuality;
      repWindRank = top.windRank;
      repEnergyKj = top.energyKj;
    } else if (ratedCandidates.length > 0) {
      const sorted = [...ratedCandidates].sort((a, b) => {
        if (b.rating.stars !== a.rating.stars) return b.rating.stars - a.rating.stars;
        if (b.windRank !== a.windRank) return b.windRank - a.windRank;
        return b.energyKj - a.energyKj;
      });
      const top = sorted[0];
      repSwellHeight = getRepresentativeDisplayHeight(top.hour, spot);
      repWindQuality = top.rating.windQuality;
      repWindRank = top.windRank;
      repEnergyKj = top.energyKj;
    }

    return {
      dayKey,
      shortLabel,
      dayNumber,
      maxStars,
      swellHeight: Math.round(repSwellHeight * 10) / 10,
      windQuality: repWindQuality,
      repWindRank,
      repEnergyKj,
    };
  });

  // Determinar isBestDay: solo si maxStars >= 3
  let bestDayIndex = -1;
  let bestScore = { stars: 2, windRank: 0, energyKj: 0 };

  interimDays.forEach((day, index) => {
    if (day.maxStars < 3) return;

    if (bestDayIndex === -1) {
      bestDayIndex = index;
      bestScore = {
        stars: day.maxStars,
        windRank: day.repWindRank,
        energyKj: day.repEnergyKj,
      };
      return;
    }

    const isBetter =
      day.maxStars > bestScore.stars ||
      (day.maxStars === bestScore.stars && day.repWindRank > bestScore.windRank) ||
      (day.maxStars === bestScore.stars &&
        day.repWindRank === bestScore.windRank &&
        day.repEnergyKj > bestScore.energyKj);

    if (isBetter) {
      bestDayIndex = index;
      bestScore = {
        stars: day.maxStars,
        windRank: day.repWindRank,
        energyKj: day.repEnergyKj,
      };
    }
  });

  return interimDays.map((day, index) => ({
    dayKey: day.dayKey,
    shortLabel: day.shortLabel,
    dayNumber: day.dayNumber,
    maxStars: day.maxStars,
    swellHeight: day.swellHeight,
    windQuality: day.windQuality,
    isBestDay: index === bestDayIndex,
  }));
}
