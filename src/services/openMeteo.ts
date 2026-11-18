import type { SpotConfig, HourlyConditions } from './surfRating';

export interface ForecastData extends HourlyConditions {
  time: string;
}

export async function fetchForecast(spot: SpotConfig): Promise<ForecastData[]> {
  const { lat, lon } = spot;
  
  // Traemos olas y viento en paralelo de las dos APIs de Open-Meteo
  const [marineRes, weatherRes] = await Promise.all([
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_direction&timezone=auto`),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto`)
  ]);

  const marineData = await marineRes.json();
  const weatherData = await weatherRes.json();

  const conditions: ForecastData[] = [];
  const now = new Date();
  // Restamos 1 hora para ver la condición actual y no solo las futuras
  const startFilter = new Date(now.setHours(now.getHours() - 1)); 

  for (let i = 0; i < marineData.hourly.time.length; i++) {
    const time = new Date(marineData.hourly.time[i]);
    
    if (time >= startFilter) {
      conditions.push({
        time: time.toISOString(),
        waveHeight: marineData.hourly.wave_height[i] || 0,
        wavePeriod: marineData.hourly.wave_period[i] || 0,
        waveDirection: marineData.hourly.wave_direction[i] || 0,
        windSpeed: weatherData.hourly.wind_speed_10m[i] || 0,
        windDirection: weatherData.hourly.wind_direction_10m[i] || 0,
      });
    }
    // Solo mostramos las próximas 24 horas para no saturar el celular
    if (conditions.length >= 24) break;
  }

  return conditions;
}