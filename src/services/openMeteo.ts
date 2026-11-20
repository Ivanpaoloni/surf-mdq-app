import type { SpotConfig, HourlyConditions } from './surfRating';

export interface ForecastData extends HourlyConditions {
  time: string;
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
  };
}

interface OpenMeteoWeatherResponse {
  hourly: {
    time: string[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
  };
}

const MARINE_HOURLY_PARAMS =
  'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction';

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

export async function fetchForecast(spot: SpotConfig): Promise<ForecastData[]> {
  const { lat, lon } = spot;

  const [marineRes, weatherRes] = await Promise.all([
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=${MARINE_HOURLY_PARAMS}&forecast_days=5&timezone=auto`),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=5&timezone=auto`)
  ]);

  const marineData: OpenMeteoMarineResponse = await marineRes.json();
  const weatherData: OpenMeteoWeatherResponse = await weatherRes.json();

  const conditions: ForecastData[] = [];
  const startFilter = new Date(Date.now() - 60 * 60 * 1000);

  for (let i = 0; i < marineData.hourly.time.length; i++) {
    const time = new Date(marineData.hourly.time[i]);

    if (time >= startFilter) {
      conditions.push(buildForecastPoint(marineData.hourly, weatherData.hourly, i));
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
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=${MARINE_HOURLY_PARAMS}&forecast_days=1&timezone=auto`),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=1&timezone=auto`)
  ]);

  const marineRaw = await marineRes.json();
  const weatherRaw = await weatherRes.json();

  const marineList: OpenMeteoMarineResponse[] = Array.isArray(marineRaw) ? marineRaw : [marineRaw];
  const weatherList: OpenMeteoWeatherResponse[] = Array.isArray(weatherRaw) ? weatherRaw : [weatherRaw];

  const currentHour = new Date().getHours();
  const result: Record<string, ForecastData> = {};

  spots.forEach((spot, idx) => {
    const m = marineList[idx]?.hourly;
    const w = weatherList[idx]?.hourly;
    if (!m || !w) return;

    const hourIdx = Math.min(currentHour, m.time.length - 1);
    result[spot.id] = buildForecastPoint(m, w, hourIdx);
  });

  return result;
}