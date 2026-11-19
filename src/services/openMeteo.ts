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
  };
}

interface OpenMeteoWeatherResponse {
  hourly: {
    time: string[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
  };
}

export async function fetchForecast(spot: SpotConfig): Promise<ForecastData[]> {
  const { lat, lon } = spot;

  const [marineRes, weatherRes] = await Promise.all([
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_direction&forecast_days=5&timezone=auto`),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=5&timezone=auto`)
  ]);

  const marineData: OpenMeteoMarineResponse = await marineRes.json();
  const weatherData: OpenMeteoWeatherResponse = await weatherRes.json();

  const conditions: ForecastData[] = [];
  const startFilter = new Date(Date.now() - 60 * 60 * 1000);

  for (let i = 0; i < marineData.hourly.time.length; i++) {
    const time = new Date(marineData.hourly.time[i]);

    if (time >= startFilter) {
      conditions.push({
        time: marineData.hourly.time[i],
        waveHeight: marineData.hourly.wave_height[i] ?? 0,
        wavePeriod: marineData.hourly.wave_period[i] ?? 0,
        waveDirection: marineData.hourly.wave_direction[i] ?? 0,
        windSpeed: weatherData.hourly.wind_speed_10m[i] ?? 0,
        windDirection: weatherData.hourly.wind_direction_10m[i] ?? 0,
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
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,wave_period,wave_direction&forecast_days=1&timezone=auto`),
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
    result[spot.id] = {
      time: m.time[hourIdx],
      waveHeight: m.wave_height[hourIdx] ?? 0,
      wavePeriod: m.wave_period[hourIdx] ?? 0,
      waveDirection: m.wave_direction[hourIdx] ?? 0,
      windSpeed: w.wind_speed_10m[hourIdx] ?? 0,
      windDirection: w.wind_direction_10m[hourIdx] ?? 0,
    };
  });

  return result;
}