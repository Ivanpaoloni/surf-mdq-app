import type { SpotConfig, HourlyConditions, SecondarySwellInput } from './surfRating';

export type TideTrend = 'rising' | 'falling' | null;

export interface TidePeak {
  time: string;
  type: 'high' | 'low';
  height: number;
}

export interface CurrentTideState {
  height: number;
  trend: TideTrend;
}

export interface CachedForecast {
  fetchedAt: number;
  data: ForecastData[];
}

export type SwellComponent = SecondarySwellInput;

export interface ForecastData extends HourlyConditions {
  time: string;
  primarySwell?: { height: number; period: number; direction: number } | null;
  secondarySwell?: SwellComponent | null;
  weatherCode?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
  waterTemp?: number | null;
  airTemp?: number | null;
  windGusts?: number | null;
  tideHeight?: number | null;
  tideTrend?: TideTrend;
  isNight?: boolean;
}

interface MarineHourlyData {
  time: string[];
  wave_height: (number | null)[];
  wave_period: (number | null)[];
  wave_direction: (number | null)[];
  swell_wave_height?: (number | null)[];
  swell_wave_period?: (number | null)[];
  swell_wave_direction?: (number | null)[];
  secondary_swell_wave_height?: (number | null)[];
  secondary_swell_wave_period?: (number | null)[];
  secondary_swell_wave_direction?: (number | null)[];
  wind_wave_height?: (number | null)[];
  wind_wave_period?: (number | null)[];
  wind_wave_direction?: (number | null)[];
  sea_surface_temperature?: (number | null)[];
  sea_level_height_msl?: (number | null)[];
}

interface OpenMeteoMarineResponse {
  hourly?: MarineHourlyData;
}

interface OpenMeteoWeatherResponse {
  hourly: {
    time: string[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    temperature_2m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    weather_code?: (number | null)[];
  };
  daily?: {
    time: string[];
    sunrise?: (string | null)[];
    sunset?: (string | null)[];
  };
}

const MDP_TIDE_DATUM_OFFSET = 0.8;
const CACHE_PREFIX = 'surfmdq:cache:';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readForecastCache(
  spotId: string,
  nowMs: number = Date.now()
): CachedForecast | null {
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${spotId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as CachedForecast).fetchedAt !== 'number' ||
      !Number.isFinite((parsed as CachedForecast).fetchedAt) ||
      !Array.isArray((parsed as CachedForecast).data)
    ) {
      return null;
    }

    const cached = parsed as CachedForecast;
    if (cached.data.length === 0) return null;
    if (nowMs - cached.fetchedAt > CACHE_MAX_AGE_MS) return null;

    const validData = cached.data
      .filter(
        (item): item is ForecastData =>
          Boolean(item) &&
          typeof item.time === 'string' &&
          typeof item.waveHeight === 'number' &&
          Number.isFinite(item.waveHeight) &&
          typeof item.windSpeed === 'number' &&
          Number.isFinite(item.windSpeed)
      )
      .map((item) => {
        const primary = item.primarySwell ?? {
          height: item.waveHeight,
          period: item.wavePeriod,
          direction: item.waveDirection,
        };
        if (item.secondarySwell && isDuplicateSwell(primary, item.secondarySwell)) {
          return { ...item, secondarySwell: null };
        }
        return item;
      });
    if (validData.length === 0) return null;

    return { fetchedAt: cached.fetchedAt, data: validData };
  } catch {
    return null;
  }
}

export function writeForecastCache(
  spotId: string,
  data: ForecastData[],
  fetchedAt: number
): void {
  try {
    const payload: CachedForecast = { fetchedAt, data };
    window.localStorage.setItem(`${CACHE_PREFIX}${spotId}`, JSON.stringify(payload));
  } catch {
    // Ignorar errores por cuota llena o modo privado
  }
}

const MARINE_MAP_WAVE_PARAMS =
  'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction';

const MARINE_WAVE_PARAMS =
  `${MARINE_MAP_WAVE_PARAMS},secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_period,wind_wave_direction`;

const MARINE_BASE_FORECAST_PARAMS =
  `${MARINE_WAVE_PARAMS},sea_surface_temperature,sea_level_height_msl`;

const WEATHER_FORECAST_PARAMS =
  'wind_speed_10m,wind_direction_10m,temperature_2m,wind_gusts_10m,weather_code';

function toFiniteNumber(val: number | null | undefined): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function mergeArray(
  primary: (number | null)[] | undefined,
  fallback: (number | null)[] | undefined,
  length: number
): (number | null)[] | undefined {
  if (!primary && !fallback) return undefined;
  const merged: (number | null)[] = new Array(length);
  for (let i = 0; i < length; i++) {
    const pVal = toFiniteNumber(primary?.[i]);
    merged[i] = pVal !== null ? pVal : toFiniteNumber(fallback?.[i]);
  }
  return merged;
}

function mergeWaveHourly(
  noaa: MarineHourlyData | undefined,
  base: MarineHourlyData
): MarineHourlyData {
  const len = base.time.length;
  return {
    time: base.time,
    wave_height: mergeArray(noaa?.wave_height, base.wave_height, len) ?? base.wave_height,
    wave_period: mergeArray(noaa?.wave_period, base.wave_period, len) ?? base.wave_period,
    wave_direction: mergeArray(noaa?.wave_direction, base.wave_direction, len) ?? base.wave_direction,
    swell_wave_height: mergeArray(noaa?.swell_wave_height, base.swell_wave_height, len),
    swell_wave_period: mergeArray(noaa?.swell_wave_period, base.swell_wave_period, len),
    swell_wave_direction: mergeArray(noaa?.swell_wave_direction, base.swell_wave_direction, len),
    secondary_swell_wave_height: mergeArray(
      noaa?.secondary_swell_wave_height,
      base.secondary_swell_wave_height,
      len
    ),
    secondary_swell_wave_period: mergeArray(
      noaa?.secondary_swell_wave_period,
      base.secondary_swell_wave_period,
      len
    ),
    secondary_swell_wave_direction: mergeArray(
      noaa?.secondary_swell_wave_direction,
      base.secondary_swell_wave_direction,
      len
    ),
    wind_wave_height: mergeArray(noaa?.wind_wave_height, base.wind_wave_height, len),
    wind_wave_period: mergeArray(noaa?.wind_wave_period, base.wind_wave_period, len),
    wind_wave_direction: mergeArray(noaa?.wind_wave_direction, base.wind_wave_direction, len),
    // Marea y temperatura del agua siempre desde la consulta base
    sea_surface_temperature: base.sea_surface_temperature,
    sea_level_height_msl: base.sea_level_height_msl,
  };
}

function buildForecastPoint(
  marine: MarineHourlyData,
  weather: OpenMeteoWeatherResponse['hourly'],
  i: number
): ForecastData {
  const swellHeight = marine.swell_wave_height?.[i] ?? 0;
  const swellPeriod = marine.swell_wave_period?.[i] ?? 0;
  const swellDir = marine.swell_wave_direction?.[i] ?? 0;
  const rawWaveHeight = marine.wave_height[i] ?? 0;

  const useSwell = swellHeight >= 0.35 && swellHeight >= rawWaveHeight * 0.65;

  return {
    time: marine.time[i],
    waveHeight: useSwell ? swellHeight : rawWaveHeight,
    wavePeriod: useSwell ? swellPeriod : (marine.wave_period[i] ?? 0),
    waveDirection: useSwell ? swellDir : (marine.wave_direction[i] ?? 0),
    rawWaveHeight,
    windSpeed: weather.wind_speed_10m[i] ?? 0,
    windDirection: weather.wind_direction_10m[i] ?? 0,
  };
}

function computeTideTrend(
  heights: (number | null)[] | undefined,
  i: number
): TideTrend {
  if (!heights) return null;
  const curr = toFiniteNumber(heights[i]);
  if (curr === null) return null;

  const eps = 0.005;
  const next = toFiniteNumber(heights[i + 1]);
  if (next !== null && Math.abs(next - curr) > eps) {
    return next > curr ? 'rising' : 'falling';
  }

  const next2 = toFiniteNumber(heights[i + 2]);
  if (next2 !== null && Math.abs(next2 - curr) > eps) {
    return next2 > curr ? 'rising' : 'falling';
  }

  const prev = toFiniteNumber(heights[i - 1]);
  if (prev !== null && Math.abs(curr - prev) > eps) {
    return curr > prev ? 'rising' : 'falling';
  }

  return null;
}

export function getCurrentTideState(
  forecast: ForecastData[],
  nowMs: number
): CurrentTideState | null {
  const valid = forecast
    .map((item) => ({
      ms: new Date(item.time).getTime(),
      height: item.tideHeight,
    }))
    .filter(
      (pt): pt is { ms: number; height: number } =>
        Number.isFinite(pt.ms) &&
        typeof pt.height === 'number' &&
        Number.isFinite(pt.height)
    )
    .sort((a, b) => a.ms - b.ms);

  if (valid.length === 0) return null;

  const eps = 0.005;
  let idx0 = -1;
  for (let i = 0; i < valid.length - 1; i++) {
    if (valid[i].ms <= nowMs && nowMs <= valid[i + 1].ms) {
      idx0 = i;
      break;
    }
  }

  let height: number;
  let trend: TideTrend = null;

  if (idx0 !== -1) {
    const h0 = valid[idx0];
    const h1 = valid[idx0 + 1];
    const span = h1.ms - h0.ms;
    const ratio = span > 0 ? (nowMs - h0.ms) / span : 0;
    height = h0.height + (h1.height - h0.height) * ratio;

    const diff1 = h1.height - h0.height;
    if (Math.abs(diff1) > eps) {
      trend = diff1 > 0 ? 'rising' : 'falling';
    } else if (idx0 + 2 < valid.length) {
      const diff2 = valid[idx0 + 2].height - h0.height;
      if (Math.abs(diff2) > eps) {
        trend = diff2 > 0 ? 'rising' : 'falling';
      }
    }
  } else {
    let closestIdx = 0;
    let bestDiff = Math.abs(valid[0].ms - nowMs);
    for (let i = 1; i < valid.length; i++) {
      const d = Math.abs(valid[i].ms - nowMs);
      if (d < bestDiff) {
        bestDiff = d;
        closestIdx = i;
      }
    }
    height = valid[closestIdx].height;

    if (closestIdx + 1 < valid.length) {
      const diff1 = valid[closestIdx + 1].height - valid[closestIdx].height;
      if (Math.abs(diff1) > eps) {
        trend = diff1 > 0 ? 'rising' : 'falling';
      } else if (closestIdx + 2 < valid.length) {
        const diff2 = valid[closestIdx + 2].height - valid[closestIdx].height;
        if (Math.abs(diff2) > eps) {
          trend = diff2 > 0 ? 'rising' : 'falling';
        }
      }
    }
  }

  return {
    height: Number(height.toFixed(2)),
    trend,
  };
}

function angularDiffDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function isDuplicateSwell(
  a: { height: number; period: number; direction: number },
  b: { height: number; period: number; direction: number }
): boolean {
  return (
    Math.abs(a.height - b.height) <= 0.1 &&
    Math.abs(a.period - b.period) <= 1 &&
    angularDiffDeg(a.direction, b.direction) <= 15
  );
}

interface ExtractedPrimarySwell {
  swell: { height: number; period: number; direction: number };
  isFromGroundSwell: boolean;
}

function extractPrimarySwell(
  marine: MarineHourlyData,
  i: number
): ExtractedPrimarySwell | null {
  const swellH = toFiniteNumber(marine.swell_wave_height?.[i]);
  const waveP = toFiniteNumber(marine.wave_period[i]) ?? 0;
  const waveD = toFiniteNumber(marine.wave_direction[i]) ?? 0;

  if (swellH !== null && swellH >= 0.1) {
    return {
      swell: {
        height: swellH,
        period: toFiniteNumber(marine.swell_wave_period?.[i]) ?? waveP,
        direction: toFiniteNumber(marine.swell_wave_direction?.[i]) ?? waveD,
      },
      isFromGroundSwell: true,
    };
  }

  const rawH = toFiniteNumber(marine.wave_height[i]);
  if (rawH !== null) {
    return {
      swell: {
        height: rawH,
        period: waveP,
        direction: waveD,
      },
      isFromGroundSwell: false,
    };
  }

  return null;
}

function extractSecondarySwell(
  marine: MarineHourlyData,
  i: number,
  primaryInfo: ExtractedPrimarySwell | null
): SwellComponent | null {
  const secH = toFiniteNumber(marine.secondary_swell_wave_height?.[i]);
  if (secH !== null && secH >= 0.1) {
    const candidate: SwellComponent = {
      height: secH,
      period: toFiniteNumber(marine.secondary_swell_wave_period?.[i]) ?? 0,
      direction: toFiniteNumber(marine.secondary_swell_wave_direction?.[i]) ?? 0,
    };
    if (!primaryInfo || !isDuplicateSwell(primaryInfo.swell, candidate)) {
      return candidate;
    }
  }

  // Solo usar wind_wave como Swell 2 cuando Swell 1 es un swell real (no fallback de mar de viento)
  if (primaryInfo?.isFromGroundSwell) {
    const windWaveH = toFiniteNumber(marine.wind_wave_height?.[i]);
    if (windWaveH !== null && windWaveH >= 0.25) {
      const candidate: SwellComponent = {
        height: windWaveH,
        period: toFiniteNumber(marine.wind_wave_period?.[i]) ?? 0,
        direction: toFiniteNumber(marine.wind_wave_direction?.[i]) ?? 0,
        isWindWave: true,
      };
      if (!isDuplicateSwell(primaryInfo.swell, candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function getDailyTidePeaks(forecast: ForecastData[]): Record<string, TidePeak[]> {
  const valid = forecast.filter(
    (f): f is ForecastData & { tideHeight: number } =>
      typeof f.tideHeight === 'number' && Number.isFinite(f.tideHeight)
  );

  const peaks: TidePeak[] = [];

  for (let i = 1; i < valid.length - 1; i++) {
    const prev = valid[i - 1].tideHeight;
    const curr = valid[i].tideHeight;
    const next = valid[i + 1].tideHeight;

    let type: 'high' | 'low' | null = null;
    if (prev < curr && curr >= next) {
      type = 'high';
    } else if (prev > curr && curr <= next) {
      type = 'low';
    }

    if (!type) continue;

    const lastPeak = peaks[peaks.length - 1];
    if (lastPeak) {
      if (lastPeak.type === type) {
        const isMoreExtreme =
          type === 'high' ? curr > lastPeak.height : curr < lastPeak.height;
        if (isMoreExtreme) {
          peaks[peaks.length - 1] = { time: valid[i].time, type, height: curr };
        }
        continue;
      }

      if (Math.abs(curr - lastPeak.height) < 0.03) {
        continue;
      }
    }

    peaks.push({ time: valid[i].time, type, height: curr });
  }

  const byDate: Record<string, TidePeak[]> = {};
  for (const peak of peaks) {
    const dateKey = peak.time.slice(0, 10);
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(peak);
  }

  return byDate;
}

export async function fetchForecast(spot: SpotConfig): Promise<ForecastData[]> {
  const { lat, lon } = spot;

  const marineNoaaUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=${MARINE_WAVE_PARAMS}&models=ncep_gfswave025&cell_selection=sea&forecast_days=5&timezone=auto`;
  const marineBaseUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=${MARINE_BASE_FORECAST_PARAMS}&cell_selection=sea&forecast_days=5&timezone=auto`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${WEATHER_FORECAST_PARAMS}&daily=sunrise,sunset&forecast_days=5&timezone=auto`;

  const [marineNoaaData, marineBaseRes, weatherRes] = await Promise.all([
    fetch(marineNoaaUrl)
      .then((res) => (res.ok ? (res.json() as Promise<OpenMeteoMarineResponse>) : null))
      .catch(() => null),
    fetch(marineBaseUrl),
    fetch(weatherUrl),
  ]);

  const marineBaseData: OpenMeteoMarineResponse = await marineBaseRes.json();
  const weatherData: OpenMeteoWeatherResponse = await weatherRes.json();

  if (!marineBaseData.hourly) return [];

  const mergedMarine = mergeWaveHourly(marineNoaaData?.hourly, marineBaseData.hourly);

  const sunByDate = new Map<
    string,
    { sunriseMs: number; sunsetMs: number; sunriseStr: string; sunsetStr: string }
  >();
  if (weatherData.daily?.time) {
    weatherData.daily.time.forEach((dateStr, idx) => {
      const sr = weatherData.daily?.sunrise?.[idx];
      const ss = weatherData.daily?.sunset?.[idx];
      if (sr && ss) {
        const sunriseMs = new Date(sr).getTime();
        const sunsetMs = new Date(ss).getTime();
        if (Number.isFinite(sunriseMs) && Number.isFinite(sunsetMs)) {
          sunByDate.set(dateStr, {
            sunriseMs,
            sunsetMs,
            sunriseStr: sr.slice(11, 16),
            sunsetStr: ss.slice(11, 16),
          });
        }
      }
    });
  }

  const conditions: ForecastData[] = [];

  for (let i = 0; i < mergedMarine.time.length; i++) {
    const timeStr = mergedMarine.time[i];
    const time = new Date(timeStr);
    const base = buildForecastPoint(mergedMarine, weatherData.hourly, i);
    const dateKey = timeStr.slice(0, 10);
    const sun = sunByDate.get(dateKey);
    const timeMs = time.getTime();
    const hour = time.getHours();

    const isNight =
      sun && Number.isFinite(timeMs)
        ? timeMs < sun.sunriseMs || timeMs >= sun.sunsetMs
        : hour < 6 || hour >= 20;

    const rawTide = toFiniteNumber(marineBaseData.hourly.sea_level_height_msl?.[i]);
    const tideHeight =
      rawTide !== null
        ? Math.max(0, Number((rawTide + MDP_TIDE_DATUM_OFFSET).toFixed(2)))
        : null;

    const primaryInfo = extractPrimarySwell(mergedMarine, i);
    const secondarySwell = extractSecondarySwell(mergedMarine, i, primaryInfo);

    conditions.push({
      ...base,
      primarySwell: primaryInfo?.swell ?? null,
      secondarySwell,
      weatherCode: toFiniteNumber(weatherData.hourly.weather_code?.[i]),
      sunrise: sun?.sunriseStr ?? null,
      sunset: sun?.sunsetStr ?? null,
      waterTemp: toFiniteNumber(marineBaseData.hourly.sea_surface_temperature?.[i]),
      airTemp: toFiniteNumber(weatherData.hourly.temperature_2m?.[i]),
      windGusts: toFiniteNumber(weatherData.hourly.wind_gusts_10m?.[i]),
      tideHeight,
      tideTrend: computeTideTrend(marineBaseData.hourly.sea_level_height_msl, i),
      isNight,
    });
  }

  return conditions;
}

// Trae el estado actual de todas las playas en un solo request por lote (NOAA con fallback)
export async function fetchAllSpotsCurrent(
  spots: SpotConfig[]
): Promise<Record<string, ForecastData>> {
  const lats = spots.map((s) => s.lat).join(',');
  const lons = spots.map((s) => s.lon).join(',');

  const marineNoaaUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=${MARINE_MAP_WAVE_PARAMS}&models=ncep_gfswave025&cell_selection=sea&forecast_days=1&timezone=auto`;
  const marineBaseUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=${MARINE_MAP_WAVE_PARAMS}&cell_selection=sea&forecast_days=1&timezone=auto`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=1&timezone=auto`;

  const [marineNoaaRaw, marineBaseRes, weatherRes] = await Promise.all([
    fetch(marineNoaaUrl)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null),
    fetch(marineBaseUrl),
    fetch(weatherUrl),
  ]);

  const marineBaseRaw = await marineBaseRes.json();
  const weatherRaw = await weatherRes.json();

  const marineNoaaList: OpenMeteoMarineResponse[] = marineNoaaRaw
    ? Array.isArray(marineNoaaRaw)
      ? marineNoaaRaw
      : [marineNoaaRaw]
    : [];
  const marineBaseList: OpenMeteoMarineResponse[] = Array.isArray(marineBaseRaw)
    ? marineBaseRaw
    : [marineBaseRaw];
  const weatherList: OpenMeteoWeatherResponse[] = Array.isArray(weatherRaw)
    ? weatherRaw
    : [weatherRaw];

  const nowMs = Date.now();
  const currentHour = new Date(nowMs).getHours();
  const result: Record<string, ForecastData> = {};

  spots.forEach((spot, idx) => {
    const baseHourly = marineBaseList[idx]?.hourly;
    const noaaHourly = marineNoaaList[idx]?.hourly;
    const w = weatherList[idx]?.hourly;
    if (!baseHourly || !w || baseHourly.time.length === 0) return;

    const merged = mergeWaveHourly(noaaHourly, baseHourly);

    let hourIdx = Math.min(currentHour, merged.time.length - 1);
    let bestDiff = Infinity;
    for (let i = 0; i < merged.time.length; i++) {
      const t = new Date(merged.time[i]).getTime();
      if (Number.isFinite(t)) {
        const diff = Math.abs(t - nowMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          hourIdx = i;
        }
      }
    }

    result[spot.id] = {
      ...buildForecastPoint(merged, w, hourIdx),
      primarySwell: extractPrimarySwell(merged, hourIdx)?.swell ?? null,
    };
  });

  return result;
}
