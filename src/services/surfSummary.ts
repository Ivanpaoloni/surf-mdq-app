import type { ForecastData, TidePeak } from './openMeteo';
import {
  calculateSurfRating,
  findBestSessionWindow,
  getSwellExposureFactor,
  type BestSessionWindow,
  type SpotConfig,
  type WindQuality,
} from './surfRating';
import { degToCompass, formatHourHHMM, parseClockToHours } from '../utils/surfFormat';

export type DayPeriodId = 'morning' | 'midday' | 'afternoon';

export interface PeriodSummary {
  id: DayPeriodId;
  label: string;
  rangeLabel: string;
  hasData: boolean;
  hasBestWindow: boolean;
  text: string;
  tideNote: string | null;
}

export interface DayTextSummary {
  dateKey: string;
  fullDateLabel: string;
  defaultPeriod: DayPeriodId;
  periods: Record<DayPeriodId, PeriodSummary>;
}

const PERIOD_DEFS: readonly {
  id: DayPeriodId;
  label: string;
  rangeLabel: string;
  startHour: number;
  endHour: number;
}[] = [
  { id: 'morning', label: 'Mañana', rangeLabel: '06–11h', startHour: 6, endHour: 11 },
  { id: 'midday', label: 'Mediodía', rangeLabel: '12–16h', startHour: 12, endHour: 16 },
  { id: 'afternoon', label: 'Tarde', rangeLabel: '17–20h', startHour: 17, endHour: 20 },
];

const WEEKDAYS_LONG = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

function formatFullDateLabel(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return dateKey;
  }
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  const weekday = WEEKDAYS_LONG[dt.getDay()] ?? '';
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${weekday} ${dd}/${mm}`;
}

function getSwell1(item: ForecastData): { height: number; period: number; direction: number } {
  const src = item.primarySwell ?? {
    height: item.waveHeight,
    period: item.wavePeriod,
    direction: item.waveDirection,
  };
  return {
    height: Number.isFinite(src.height) ? Math.max(0, src.height) : 0,
    period: Number.isFinite(src.period) ? Math.max(0, src.period) : 0,
    direction: Number.isFinite(src.direction) ? src.direction : 0,
  };
}

function getSurferBodyScale(height: number): string {
  if (height < 0.4) return 'plato / tobillos';
  if (height <= 0.65) return 'por la rodilla';
  if (height <= 1.05) return 'por la cintura';
  if (height <= 1.45) return 'por el pecho';
  if (height <= 1.85) return 'por los hombros / cabeza';
  return 'por encima de la cabeza';
}

function formatSurferWaveOpening(
  modelHeight: number,
  exposureFactor: number,
  swellDir: string
): string {
  const modelH = Math.round(modelHeight * 10) / 10;
  const effRaw = modelHeight * Math.sqrt(exposureFactor);
  const effH = Math.round(effRaw * 10) / 10;

  // Swell favorable (verde): redacción directa con la altura del modelo
  if (exposureFactor >= 0.72) {
    const scale = getSurferBodyScale(modelHeight);
    if (modelHeight < 0.4) {
      return `Mar muy chico (${scale}, ${modelH.toFixed(1)} m) con swell entrando favorable del ${swellDir}`;
    }
    return `Olas ${scale} (${modelH.toFixed(1)} m) con swell entrando favorable del ${swellDir}`;
  }

  // Swell atenuado (amarillo o rojo): escala corporal sobre la altura efectiva + referencia transparente del modelo
  const angleNote =
    exposureFactor >= 0.25
      ? `entrando del ${swellDir} en ángulo abierto`
      : `entrando del ${swellDir}, bloqueado para el spot`;

  if (effRaw < 0.4) {
    return `Mar muy chico (~${effH.toFixed(1)} m reales; ${modelH.toFixed(1)} m en el modelo ${angleNote})`;
  }

  const scale = getSurferBodyScale(effRaw);
  return `Olas ${scale} (~${effH.toFixed(1)} m reales; ${modelH.toFixed(1)} m en el modelo ${angleNote})`;
}

function formatPeriodPhrase(periodSec: number): string {
  const p = Math.round(periodSec);
  if (p < 8) return `período corto (${p}s)`;
  if (p <= 10) return `período medio (${p}s)`;
  if (p <= 13) return `buen período (${p}s)`;
  return `período largo (${p}s)`;
}

function formatWindIntensity(speedKmh: number): string {
  if (speedKmh < 10) return 'suave';
  if (speedKmh < 20) return 'moderado';
  if (speedKmh < 30) return 'fuerte';
  return 'muy fuerte';
}

function formatWindQualityLabel(quality: WindQuality): string {
  if (quality === 'calm') return 'calmo';
  if (quality === 'offshore') return 'offshore';
  if (quality === 'cross') return 'cruzado';
  return 'onshore';
}

function getPeriodForHour(hour: number): DayPeriodId | null {
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'midday';
  if (hour >= 17 && hour <= 20) return 'afternoon';
  return null;
}

function buildTideNote(
  periodHours: ForecastData[],
  dayPeaks: TidePeak[],
  startHour: number,
  endHour: number
): string | null {
  if (periodHours.length === 0) return null;

  const peaksInPeriod = dayPeaks.filter((peak) => {
    const h = parseClockToHours(peak.time.slice(11, 16), -1);
    return h >= startHour && h <= endHour + 0.99;
  });

  if (peaksInPeriod.length > 0) {
    const peak = peaksInPeriod[0];
    const peakHour = parseClockToHours(peak.time.slice(11, 16), startHour);
    const timeStr = formatHourHHMM(peak.time);
    const heightStr = `${peak.height.toFixed(1)} m`;

    if (peak.type === 'high') {
      if (peakHour <= startHour + 0.5) {
        return `Pleamar a las ${timeStr} (${heightStr}), luego en descenso`;
      }
      return `Marea subiendo hacia la pleamar de las ${timeStr} (${heightStr})`;
    }

    if (peakHour <= startHour + 0.5) {
      return `Bajamar a las ${timeStr} (${heightStr}), luego en ascenso`;
    }
    return `Marea bajando hasta la bajamar de las ${timeStr} (${heightStr})`;
  }

  const nextPeak = dayPeaks.find((peak) => {
    const h = parseClockToHours(peak.time.slice(11, 16), -1);
    return h > endHour;
  });

  if (nextPeak) {
    const timeStr = formatHourHHMM(nextPeak.time);
    return nextPeak.type === 'high'
      ? `Marea subiendo hacia la pleamar de las ${timeStr}`
      : `Marea bajando hacia la bajamar de las ${timeStr}`;
  }

  const risingCount = periodHours.filter((h) => h.tideTrend === 'rising').length;
  const fallingCount = periodHours.filter((h) => h.tideTrend === 'falling').length;
  if (risingCount > fallingCount) return 'Marea en ascenso durante la franja';
  if (fallingCount > risingCount) return 'Marea en descenso durante la franja';

  return null;
}

function buildPeriodText(periodHours: ForecastData[], spot: SpotConfig): string {
  if (periodHours.length === 0) {
    return 'Sin datos horarios disponibles para esta franja.';
  }

  const chronological = [...periodHours].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const swells = chronological.map(getSwell1);
  const avgHeight = swells.reduce((sum, s) => sum + s.height, 0) / swells.length;
  const avgPeriod = swells.reduce((sum, s) => sum + s.period, 0) / swells.length;
  const midIdx = Math.floor(chronological.length / 2);
  const repSwell = swells[midIdx];

  const swellDir = degToCompass(repSwell.direction);
  const exposureFactor = getSwellExposureFactor(repSwell.direction, avgPeriod, spot);
  const waveOpening = formatSurferWaveOpening(avgHeight, exposureFactor, swellDir);

  const firstSwell = swells[0];
  const lastSwell = swells[swells.length - 1];
  const endTimeLabel = formatHourHHMM(chronological[chronological.length - 1].time);
  const heightDiff = lastSwell.height - firstSwell.height;
  const periodDiff = lastSwell.period - firstSwell.period;
  const hasHeightShift = chronological.length >= 2 && Math.abs(heightDiff) >= 0.2;
  const hasPeriodShift = chronological.length >= 2 && Math.abs(periodDiff) >= 2;

  const sentences: string[] = [];

  if (!hasHeightShift && !hasPeriodShift) {
    sentences.push(
      `${waveOpening} y ${formatPeriodPhrase(avgPeriod)}, con condiciones parejas durante la franja.`
    );
  } else {
    sentences.push(`${waveOpening} y ${formatPeriodPhrase(avgPeriod)}.`);

    if (hasHeightShift) {
      const trendWord = heightDiff > 0 ? 'va en aumento' : 'afloja';
      const periodClause = hasPeriodShift
        ? `, con período ${periodDiff > 0 ? 'en alza' : 'en baja'} hacia ${Math.round(lastSwell.period)}s`
        : '';
      sentences.push(
        `El mar ${trendWord} hacia las ${endTimeLabel} (${lastSwell.height.toFixed(1)} m${periodClause}).`
      );
    } else if (hasPeriodShift) {
      sentences.push(
        `El período ${periodDiff > 0 ? 'mejora' : 'se acorta'} hacia las ${endTimeLabel} (hasta ${Math.round(lastSwell.period)}s), manteniendo un tamaño parejo.`
      );
    }
  }

  // Viento y evolución estrictamente en orden cronológico desde la primera hora de la franja
  const ratedHours = chronological.map((item) => ({
    item,
    ms: new Date(item.time).getTime(),
    rating: calculateSurfRating(item, spot),
    speed: Number.isFinite(item.windSpeed) ? Math.max(0, item.windSpeed) : 0,
    dir: Number.isFinite(item.windDirection) ? item.windDirection : 0,
  }));

  const firstW = ratedHours[0];
  const lastW = ratedHours[ratedHours.length - 1];
  const firstTimeLabel = formatHourHHMM(firstW.item.time);
  const firstDir = degToCompass(firstW.dir);
  const firstQualityLabel = formatWindQualityLabel(firstW.rating.windQuality);
  const firstIntensity = formatWindIntensity(firstW.speed);
  const isInitialCalm = firstW.rating.windQuality === 'calm';

  const rotatedEntry = ratedHours.find(
    (entry, idx) =>
      idx > 0 &&
      entry.ms > firstW.ms &&
      entry.rating.windQuality !== firstW.rating.windQuality
  );
  const speedDiff = lastW.speed - firstW.speed;
  const hasSpeedShift =
    ratedHours.length >= 2 && lastW.ms > firstW.ms && Math.abs(speedDiff) >= 6;

  let windSentence: string;

  if (rotatedEntry) {
    const rotTime = formatHourHHMM(rotatedEntry.item.time);
    const rotQuality = formatWindQualityLabel(rotatedEntry.rating.windQuality);
    const rotSpeed = Math.round(rotatedEntry.speed);
    const startDesc = isInitialCalm
      ? `viento calmo (${Math.round(firstW.speed)} km/h)`
      : `viento ${firstIntensity} ${firstQualityLabel} del ${firstDir} (${Math.round(firstW.speed)} km/h)`;

    if (rotatedEntry.rating.windQuality === 'calm') {
      windSentence = `Arranca a las ${firstTimeLabel} con ${startDesc}, aflojando a calmo cerca de las ${rotTime} (${rotSpeed} km/h).`;
    } else {
      windSentence = `Arranca a las ${firstTimeLabel} con ${startDesc}, rotando a ${rotQuality} cerca de las ${rotTime} (${rotSpeed} km/h).`;
    }
  } else if (isInitialCalm) {
    if (hasSpeedShift) {
      windSentence = `Viento calmo al inicio (${Math.round(firstW.speed)} km/h), subiendo hacia las ${endTimeLabel} hasta ${Math.round(lastW.speed)} km/h.`;
    } else {
      windSentence = `Viento calmo (${Math.round(firstW.speed)} km/h), mar limpio durante la franja.`;
    }
  } else if (hasSpeedShift) {
    const shiftVerb = speedDiff > 0 ? 'subiendo' : 'aflojando';
    windSentence = `Viento ${firstIntensity} ${firstQualityLabel} del ${firstDir} (${Math.round(firstW.speed)} km/h), ${shiftVerb} hacia las ${endTimeLabel} hasta ${Math.round(lastW.speed)} km/h.`;
  } else {
    windSentence = `Viento ${firstIntensity} ${firstQualityLabel} del ${firstDir} (${Math.round(firstW.speed)} km/h), estable durante la franja.`;
  }

  sentences.push(windSentence);

  return sentences.join(' ');
}

function windowTouchesPeriod(
  bestWindow: BestSessionWindow | null,
  startHour: number,
  endHour: number
): boolean {
  if (!bestWindow) return false;
  const wStart = parseClockToHours(bestWindow.startTime.slice(11, 16), -1);
  const wEnd = parseClockToHours(bestWindow.endTime.slice(11, 16), -1);
  if (wStart < 0 || wEnd < 0) return false;
  return wStart <= endHour && wEnd > startHour;
}

export function buildDayTextSummary(
  dayHours: ForecastData[],
  spot: SpotConfig,
  dateKey: string,
  options: {
    dayPeaks?: TidePeak[];
    isToday?: boolean;
    currentHourTime?: string | null;
    nowMs?: number;
  } = {}
): DayTextSummary {
  const { dayPeaks = [], isToday = false, currentHourTime = null, nowMs = Date.now() } = options;

  const sortedHours = [...dayHours].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const cutoffMs = currentHourTime ? new Date(currentHourTime).getTime() : nowMs;
  const bestWindow = findBestSessionWindow(
    sortedHours,
    spot,
    isToday,
    Number.isFinite(cutoffMs) ? cutoffMs : nowMs
  );

  const periods = {} as Record<DayPeriodId, PeriodSummary>;

  for (const def of PERIOD_DEFS) {
    const slotHours = sortedHours.filter((item) => {
      const h = new Date(item.time).getHours();
      return h >= def.startHour && h <= def.endHour;
    });

    const hasData = slotHours.length > 0;
    periods[def.id] = {
      id: def.id,
      label: def.label,
      rangeLabel: def.rangeLabel,
      hasData,
      hasBestWindow: hasData && windowTouchesPeriod(bestWindow, def.startHour, def.endHour),
      text: hasData ? buildPeriodText(slotHours, spot) : 'Sin datos disponibles para esta franja.',
      tideNote: hasData ? buildTideNote(slotHours, dayPeaks, def.startHour, def.endHour) : null,
    };
  }

  // Elección automática de franja inicial
  let defaultPeriod: DayPeriodId = 'morning';

  if (isToday) {
    const refDate = currentHourTime ? new Date(currentHourTime) : new Date(nowMs);
    const currentH = refDate.getHours();
    const periodNow = getPeriodForHour(currentH);

    if (periodNow && periods[periodNow].hasData) {
      defaultPeriod = periodNow;
    } else if (currentH < 6 && periods.morning.hasData) {
      defaultPeriod = 'morning';
    } else if (bestWindow) {
      const bwPeriod = getPeriodForHour(
        Math.floor(parseClockToHours(bestWindow.startTime.slice(11, 16), 6))
      );
      if (bwPeriod && periods[bwPeriod].hasData) {
        defaultPeriod = bwPeriod;
      }
    }
  } else if (bestWindow) {
    const bwPeriod = getPeriodForHour(
      Math.floor(parseClockToHours(bestWindow.startTime.slice(11, 16), 6))
    );
    if (bwPeriod && periods[bwPeriod].hasData) {
      defaultPeriod = bwPeriod;
    }
  }

  if (!periods[defaultPeriod].hasData) {
    const firstAvailable = PERIOD_DEFS.find((d) => periods[d.id].hasData);
    if (firstAvailable) {
      defaultPeriod = firstAvailable.id;
    }
  }

  return {
    dateKey,
    fullDateLabel: formatFullDateLabel(dateKey),
    defaultPeriod,
    periods,
  };
}
