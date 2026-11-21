import type { SpotConfig, HourlyConditions } from './surfRating';

export type TideTrend = 'rising' | 'falling' | null;

export interface TidePeak {
  time: string;
  type: 'high' | 'low';
  height: number;
}

export interface SwellComponent {
  height: number;
  period: number;
  direction: number;
  isWindWave?: boolean;
}

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

interface OpenMeteoMarineResponse {
  hourly: {
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
  };
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

const MARINE_BASE_PARAMS =
  'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction';

const MARINE_FORECAST_PARAMS =
  `${MARINE_BASE_PARAMS},secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_period,wind_wave_direction,sea_surface_temperature,sea_level_height_msl`;

const WEATHER_FORECAST_PARAMS =
  'wind_speed_10m,wind_direction_10m,temperature_2m,wind_gusts_10m,weather_code';

function toFiniteNumber(val: number | null | undefined): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function buildForecastPoint(
  marine: OpenMeteoMarineResponse['hourly'],
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

  const next = toFiniteNumber(heights[i + 1]);
  if (next !== null && next !== curr) {
    return next > curr ? 'rising' : 'falling';
  }

  const prev = toFiniteNumber(heights[i - 1]);
  if (prev !== null && prev !== curr) {
    return curr > prev ? 'rising' : 'falling';
  }

  return null;
}

function extractPrimarySwell(
  marine: OpenMeteoMarineResponse['hourly'],
  i: number
): { height: number; period: number; direction: number } | null {
  const swellH = toFiniteNumber(marine.swell_wave_height?.[i]);
  const waveP = toFiniteNumber(marine.wave_period[i]) ?? 0;
  const waveD = toFiniteNumber(marine.wave_direction[i]) ?? 0;

  if (swellH !== null && swellH >= 0.1) {
    return {
      height: swellH,
      period: toFiniteNumber(marine.swell_wave_period?.[i]) ?? waveP,
      direction: toFiniteNumber(marine.swell_wave_direction?.[i]) ?? waveD,
    };
  }

  const rawH = toFiniteNumber(marine.wave_height[i]);
  if (rawH !== null) {
    return {
      height: rawH,
      period: waveP,
      direction: waveD,
    };
  }

  return null;
}

function extractSecondarySwell(
  marine: OpenMeteoMarineResponse['hourly'],
  i: number
): SwellComponent | null {
  const secH = toFiniteNumber(marine.secondary_swell_wave_height?.[i]);
  if (secH !== null && secH >= 0.15) {
    return {
      height: secH,
      period: toFiniteNumber(marine.secondary_swell_wave_period?.[i]) ?? 0,
      direction: toFiniteNumber(marine.secondary_swell_wave_direction?.[i]) ?? 0,
    };
  }

  const windWaveH = toFiniteNumber(marine.wind_wave_height?.[i]);
  if (windWaveH !== null && windWaveH >= 0.25) {
    return {
      height: windWaveH,
      period: toFiniteNumber(marine.wind_wave_period?.[i]) ?? 0,
      direction: toFiniteNumber(marine.wind_wave_direction?.[i]) ?? 0,
      isWindWave: true,
    };
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

  const [marineRes, weatherRes] = await Promise.all([
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=${MARINE_FORECAST_PARAMS}&forecast_days=5&timezone=auto`),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${WEATHER_FORECAST_PARAMS}&daily=sunrise,sunset&forecast_days=5&timezone=auto`)
  ]);

  const marineData: OpenMeteoMarineResponse = await marineRes.json();
  const weatherData: OpenMeteoWeatherResponse = await weatherRes.json();

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
  const startFilter = new Date(Date.now() - 60 * 60 * 1000);

  for (let i = 0; i < marineData.hourly.time.length; i++) {
    const timeStr = marineData.hourly.time[i];
    const time = new Date(timeStr);

    if (time >= startFilter) {
      const base = buildForecastPoint(marineData.hourly, weatherData.hourly, i);
      const dateKey = timeStr.slice(0, 10);
      const sun = sunByDate.get(dateKey);
      const timeMs = time.getTime();
      const hour = time.getHours();

      const isNight =
        sun && Number.isFinite(timeMs)
          ? timeMs < sun.sunriseMs || timeMs >= sun.sunsetMs
          : hour < 6 || hour >= 20;

      const rawTide = toFiniteNumber(marineData.hourly.sea_level_height_msl?.[i]);
      const tideHeight =
        rawTide !== null
          ? Math.max(0, Number((rawTide + MDP_TIDE_DATUM_OFFSET).toFixed(2)))
          : null;

      conditions.push({
        ...base,
        primarySwell: extractPrimarySwell(marineData.hourly, i),
        secondarySwell: extractSecondarySwell(marineData.hourly, i),
        weatherCode: toFiniteNumber(weatherData.hourly.weather_code?.[i]),
        sunrise: sun?.sunriseStr ?? null,
        sunset: sun?.sunsetStr ?? null,
        waterTemp: toFiniteNumber(marineData.hourly.sea_surface_temperature?.[i]),
        airTemp: toFiniteNumber(weatherData.hourly.temperature_2m?.[i]),
        windGusts: toFiniteNumber(weatherData.hourly.wind_gusts_10m?.[i]),
        tideHeight,
        tideTrend: computeTideTrend(marineData.hourly.sea_level_height_msl, i),
        isNight,
      });
    }
  }

  return conditions;
}

// Trae el estado actual de todas las playas en un solo request por lote
export async function fetchAllSpotsCurrent(
  spots: SpotConfig[]
): Promise<Record<string, ForecastData>> {
  const lats = spots.map((s) => s.lat).join(',');
  const lons = spots.map((s) => s.lon).join(',');

  const [marineRes, weatherRes] = await Promise.all([
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=${MARINE_BASE_PARAMS}&forecast_days=1&timezone=auto`),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=1&timezone=auto`)
  ]);

  const marineRaw = await marineRes.json();
  const weatherRaw = await weatherRes.json();

  const marineList: OpenMeteoMarineResponse[] = Array.isArray(marineRaw) ? marineRaw : [marineRaw];
  const weatherList: OpenMeteoWeatherResponse[] = Array.isArray(weatherRaw) ? weatherRaw : [weatherRaw];

  const nowMs = Date.now();
  const currentHour = new Date(nowMs).getHours();
  const result: Record<string, ForecastData> = {};

  spots.forEach((spot, idx) => {
    const m = marineList[idx]?.hourly;
    const w = weatherList[idx]?.hourly;
    if (!m || !w || m.time.length === 0) return;

    let hourIdx = Math.min(currentHour, m.time.length - 1);
    let bestDiff = Infinity;
    for (let i = 0; i < m.time.length; i++) {
      const t = new Date(m.time[i]).getTime();
      if (Number.isFinite(t)) {
        const diff = Math.abs(t - nowMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          hourIdx = i;
        }
      }
    }

    result[spot.id] = {
      ...buildForecastPoint(m, w, hourIdx),
      primarySwell: extractPrimarySwell(m, hourIdx),
    };
  });

  return result;
}
