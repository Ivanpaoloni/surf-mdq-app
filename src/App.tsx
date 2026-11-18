import { useState, useEffect } from 'react';
import spotsData from './data/spots.json';
import { fetchForecast, type ForecastData } from './services/openMeteo';
import { calculateSurfRating, type SpotConfig } from './services/surfRating';
import { MapPin, Wind, Waves, Star } from 'lucide-react';

export default function App() {
  const spots: SpotConfig[] = spotsData as SpotConfig[];
  const [selectedSpot, setSelectedSpot] = useState<SpotConfig>(spots[0]);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(true);

  // Hook que se ejecuta cada vez que cambiás de playa (como el OnParametersSetAsync en Blazor)
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchForecast(selectedSpot).then(data => {
      if (isMounted) {
        setForecast(data);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [selectedSpot]);

  // Dibujador de estrellitas
  const renderStars = (count: number) => (
    <div className="flex text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={18} fill={i < count ? "currentColor" : "none"} className={i < count ? "" : "text-slate-600"} />
      ))}
    </div>
  );

  // Color del viento según el algoritmo
  const getWindColor = (quality: string) => {
    if (quality === 'offshore') return 'text-emerald-400';
    if (quality === 'cross') return 'text-amber-400';
    return 'text-rose-400'; // onshore
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans selection:bg-sky-500/30">
      {/* Header flotante */}
      <header className="mb-6 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md pb-2 pt-2 z-10 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Waves className="text-sky-400" />
          <h1 className="text-xl font-bold text-white tracking-tight">SurfMDQ</h1>
        </div>
        
        <div className="relative">
          <select 
            className="appearance-none bg-slate-800 border border-slate-700 rounded-xl py-2 pl-3 pr-8 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            value={selectedSpot.id}
            onChange={(e) => setSelectedSpot(spots.find(s => s.id === e.target.value)!)}
          >
            {spots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <MapPin size={16} className="absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
        </div>
      </header>

      {/* Lista de Pronóstico (Cards) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center mt-32 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400"></div>
          <p className="text-slate-400 text-sm animate-pulse">Consultando boyas y satélites...</p>
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          {forecast.map((f, i) => {
            const rating = calculateSurfRating(f, selectedSpot);
            const timeObj = new Date(f.time);
            const timeStr = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            // Destacamos un poco más la hora actual (primer elemento)
            const isCurrent = i === 0;

            return (
              <div key={f.time} className={`p-4 rounded-2xl flex items-center justify-between border ${isCurrent ? 'bg-slate-800 border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.15)]' : 'bg-slate-800/50 border-slate-700/50'}`}>
                
                {/* Columna Izquierda: Hora y Estrellas */}
                <div className="flex flex-col gap-1 w-1/3">
                  <span className={`text-lg font-bold ${isCurrent ? 'text-sky-400' : 'text-slate-300'}`}>
                    {timeStr}
                  </span>
                  {renderStars(rating.stars)}
                </div>

                {/* Columna Medio: Tamaño de ola */}
                <div className="flex flex-col items-center justify-center w-1/3">
                  <span className="text-xl font-black text-white">{f.waveHeight.toFixed(1)}<span className="text-sm text-slate-400 font-medium ml-1">m</span></span>
                  <span className="text-xs text-slate-400">{f.wavePeriod.toFixed(0)}s per</span>
                </div>

                {/* Columna Derecha: Viento */}
                <div className="flex flex-col items-end w-1/3">
                  <div className="flex items-center gap-1">
                    <span className={`font-bold ${getWindColor(rating.windQuality)}`}>
                      {f.windSpeed.toFixed(0)} <span className="text-xs font-normal">km/h</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                    <Wind size={12} />
                    <span className="capitalize">{rating.windQuality}</span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}