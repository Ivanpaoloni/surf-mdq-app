import type { ForecastData, TidePeak } from './openMeteo';
import {
  calculateSurfRating,
  findBestSessionWindow,
  type BestSessionWindow,
  type SpotConfig,
} from './surfRating';
import { getSwellDirectionQuality } from './surfExtras';
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

function formatSurferWavePhrase(height: number): string {
  const h = Math.round(height * 10) / 10;
  const hStr = `${h.toFixed(1)} m`;
  if (h < 0.4) return `Mar muy chico (plato / tobillos, ${hStr})`;
  if (h <= 0.6) return `Olas por la rodilla (${hStr})`;
  if (h <= 1.0) return `Olas por la cintura (${hStr})`;
  if (h <= 1.4) return `Olas por el pecho (${hStr})`;
  if (h <= 1.8) return `Olas por los hombros / cabeza (${hStr})`;
  return `Olas por encima de la cabeza (${hStr})`;
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

function formatWindQualityLabel(quality: 'offshore' | 'cross' | 'onshore'): string {
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

  const swells = periodHours.map(getSwell1);
  const avgHeight = swells.reduce((sum, s) => sum + s.height, 0) / swells.length;
  const avgPeriod = swells.reduce((sum, s) => sum + s.period, 0) / swells.length;
  const midIdx = Math.floor(periodHours.length / 2);
  const repSwell = swells[midIdx];

  const swellDir = degToCompass(repSwell.direction);
  const swellQuality = getSwellDirectionQuality(repSwell.direction, spot.idealSwellDeg);
  const swellAngleNote =
    swellQuality === 'good'
      ? `entrando favorable del ${swellDir}`
      : swellQuality === 'fair'
        ? `del ${swellDir} en ángulo intermedio`
        : `del ${swellDir}, poco favorable para el spot`;

  const firstSwell = swells[0];
  const lastSwell = swells[swells.length - 1];
  const endTimeLabel = formatHourHHMM(periodHours[periodHours.length - 1].time);
  const heightDiff = lastSwell.height - firstSwell.height;
  const periodDiff = lastSwell.period - firstSwell.period;
  const hasHeightShift = periodHours.length >= 2 && Math.abs(heightDiff) >= 0.2;
  const hasPeriodShift = periodHours.length >= 2 && Math.abs(periodDiff) >= 2;

  const sentences: string[] = [];

  if (!hasHeightShift && !hasPeriodShift) {
    sentences.push(
      `${formatSurferWavePhrase(avgHeight)} con swell ${swellAngleNote} y ${formatPeriodPhrase(avgPeriod)}, con condiciones parejas durante la franja.`
    );
  } else {
    sentences.push(
      `${formatSurferWavePhrase(avgHeight)} con swell ${swellAngleNote} y ${formatPeriodPhrase(avgPeriod)}.`
    );

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

  // Viento y evolución
  const ratedHours = periodHours.map((item) => ({
    item,
    rating: calculateSurfRating(item, spot),
    speed: Number.isFinite(item.windSpeed) ? Math.max(0, item.windSpeed) : 0,
    dir: Number.isFinite(item.windDirection) ? item.windDirection : 0,
  }));

  const firstW = ratedHours[0];
  const lastW = ratedHours[ratedHours.length - 1];
  const firstDir = degToCompass(firstW.dir);
  const firstQualityLabel = formatWindQualityLabel(firstW.rating.windQuality);
  const firstIntensity = formatWindIntensity(firstW.speed);

  const rotatedEntry = ratedHours.find(
    (entry, idx) => idx > 0 && entry.rating.windQuality !== firstW.rating.windQuality
  );
  const speedDiff = lastW.speed - firstW.speed;
  const hasSpeedShift = ratedHours.length >= 2 && Math.abs(speedDiff) >= 6;

  let windSentence = `Viento ${firstIntensity} ${firstQualityLabel} del ${firstDir} (${Math.round(firstW.speed)} km/h)`;

  if (rotatedEntry) {
    const rotTime = formatHourHHMM(rotatedEntry.item.time);
    const rotQuality = formatWindQualityLabel(rotatedEntry.rating.windQuality);
    const rotSpeed = Math.round(rotatedEntry.speed);
    windSentence += `, rotando a ${rotQuality} cerca de las ${rotTime} (${rotSpeed} km/h).`;
  } else if (hasSpeedShift) {
    const shiftVerb = speedDiff > 0 ? 'subiendo' : 'aflojando';
    windSentence += `, ${shiftVerb} hacia las ${endTimeLabel} hasta ${Math.round(lastW.speed)} km/h.`;
  } else if (firstW.speed < 7) {
    windSentence += ', prácticamente calmo en toda la franja.';
  } else {
    windSentence += ', estable durante la franja.';
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
