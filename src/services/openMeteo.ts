import type { SpotConfig, HourlyConditions } from './surfRating';

export interface ForecastData extends HourlyConditions {
  time: string;
}

export async function fetchForecast(spot: SpotConfig): Promise<ForecastData[]> {
  const { lat, lon } = spot;

  const [marineRes, weatherRes] = await Promise.all([
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_direction&forecast_days=5&timezone=auto`),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=5&timezone=auto`)
  ]);

  const marineData = await marineRes.json();
  const weatherData = await weatherRes.json();

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