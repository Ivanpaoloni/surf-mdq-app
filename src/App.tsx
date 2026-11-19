import { useState, useEffect } from 'react';
import spotsData from './data/spots.json';
import placesData from './data/places.json';
import {
  fetchForecast,
  fetchAllSpotsCurrent,
  type ForecastData,
} from './services/openMeteo';
import { calculateSurfRating, type SpotConfig } from './services/surfRating';
import SurfMap, { type PlaceItem } from './components/SurfMap';
import GuideView from './components/GuideView';
import {
  MapPin,
  Waves,
  Star,
  ArrowDown,
  Video,
  Map as MapIcon,
  Compass,
} from 'lucide-react';

type ActiveTab = 'forecast' | 'map' | 'guide';

function degToCompass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatDayLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';

  return date.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function App() {
  const spots: SpotConfig[] = spotsData as SpotConfig[];
  const places: PlaceItem[] = placesData as PlaceItem[];

  const [activeTab, setActiveTab] = useState<ActiveTab>('forecast');
  const [selectedSpot, setSelectedSpot] = useState<SpotConfig>(spots[0]);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [stepHours, setStepHours] = useState<number>(3);
  const [loading, setLoading] = useState(true);

  // Estado del mapa (se carga por lote la primera vez que abrís la pestaña Mapa)
  const [spotsCurrent, setSpotsCurrent] = useState<Record<string, ForecastData>>({});
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lon: number; id?: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchForecast(selectedSpot).then((data) => {
      if (isMounted) {
        setForecast(data);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [selectedSpot]);

  useEffect(() => {
    if (activeTab !== 'map' || Object.keys(spotsCurrent).length > 0) return;

    let isMounted = true;
    setLoadingMap(true);
    fetchAllSpotsCurrent(spots)
      .then((data) => {
        if (isMounted) setSpotsCurrent(data);
      })
      .finally(() => {
        if (isMounted) setLoadingMap(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, spots, spotsCurrent]);

  const visibleForecast = forecast.filter((item, idx) => {
    if (stepHours === 1) return idx < 48;
    const hour = new Date(item.time).getHours();
    return hour % stepHours === 0;
  });

  const renderStars = (count: number) => (
    <div className="flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={15}
          fill={i < count ? 'currentColor' : 'none'}
          className={i < count ? '' : 'text-slate-600'}
        />
      ))}
    </div>
  );

  const getWindColor = (quality: string) => {
    if (quality === 'offshore') return 'text-emerald-400';
    if (quality === 'cross') return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-sky-500/30">
      {/* Pestaña 1: Pronóstico */}
      {activeTab === 'forecast' && (
        <div className="p-4 pb-24">
          <header className="mb-4 sticky top-0 bg-slate-900/95 backdrop-blur-md pb-3 pt-2 z-10 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Waves className="text-sky-400 shrink-0" />
                <h1 className="text-xl font-bold text-white tracking-tight">SurfMDQ</h1>
              </div>

              <div className="relative flex-1 max-w-[220px]">
                <select
                  className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl py-2 pl-3 pr-8 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-500 truncate"
                  value={selectedSpot.id}
                  onChange={(e) => {
                    const found = spots.find((s) => s.id === e.target.value);
                    if (found) setSelectedSpot(found);
                  }}
                >
                  {spots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <MapPin
                  size={16}
                  className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex bg-slate-800 p-1 rounded-xl border border-slate-700/80">
                {[1, 3, 6].map((step) => (
                  <button
                    key={step}
                    onClick={() => setStepHours(step)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      stepHours === step
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Cada {step}h
                  </button>
                ))}
              </div>

              {selectedSpot.camUrl && (
                <a
                  href={selectedSpot.camUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/30 px-3 py-1.5 rounded-xl hover:bg-sky-500/20"
                >
                  <Video size={14} />
                  Ver cámara
                </a>
              )}
            </div>
          </header>

          {loading ? (
            <div className="flex flex-col items-center justify-center mt-32 space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400"></div>
              <p className="text-slate-400 text-sm animate-pulse">Consultando boyas y satélites...</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleForecast.map((f, i) => {
                const rating = calculateSurfRating(f, selectedSpot);
                const timeObj = new Date(f.time);
                const timeStr = timeObj.toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });
                const isCurrent = i === 0;

                const prevDateStr =
                  i > 0 ? new Date(visibleForecast[i - 1].time).toDateString() : '';
                const showDayHeader = timeObj.toDateString() !== prevDateStr;

                return (
                  <div key={f.time}>
                    {showDayHeader && (
                      <div className="pt-3 pb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                        {formatDayLabel(timeObj)}
                      </div>
                    )}

                    <div
                      className={`p-3.5 rounded-2xl flex items-center justify-between border ${
                        isCurrent
                          ? 'bg-slate-800 border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                          : 'bg-slate-800/50 border-slate-700/50'
                      }`}
                    >
                      <div className="flex flex-col gap-1 w-1/3">
                        <span
                          className={`text-base font-bold ${
                            isCurrent ? 'text-sky-400' : 'text-slate-200'
                          }`}
                        >
                          {timeStr}
                        </span>
                        {renderStars(rating.stars)}
                      </div>

                      <div className="flex flex-col items-center justify-center w-1/3">
                        <span className="text-lg font-black text-white leading-tight">
                          {f.waveHeight.toFixed(1)}
                          <span className="text-xs text-slate-400 font-medium ml-0.5">m</span>
                        </span>
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <span>{f.wavePeriod.toFixed(0)}s</span>
                          <span>·</span>
                          <ArrowDown
                            size={12}
                            className="text-sky-400"
                            style={{ transform: `rotate(${f.waveDirection}deg)` }}
                          />
                          <span>{degToCompass(f.waveDirection)}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end w-1/3">
                        <div className={`flex items-center gap-1 font-bold ${getWindColor(rating.windQuality)}`}>
                          <span>
                            {f.windSpeed.toFixed(0)}{' '}
                            <span className="text-xs font-normal">km/h</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <ArrowDown
                            size={12}
                            className={getWindColor(rating.windQuality)}
                            style={{ transform: `rotate(${f.windDirection}deg)` }}
                          />
                          <span className="font-medium text-slate-300">
                            {degToCompass(f.windDirection)}
                          </span>
                          <span className="capitalize">· {rating.windQuality}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pestaña 2: Mapa Interactivo */}
      {activeTab === 'map' && (
        <SurfMap
          spots={spots}
          spotsCurrent={spotsCurrent}
          places={places}
          loading={loadingMap}
          focusTarget={mapFocus}
          onOpenSpotForecast={(spot) => {
            setSelectedSpot(spot);
            setActiveTab('forecast');
          }}
        />
      )}

      {/* Pestaña 3: Guía Surfer */}
      {activeTab === 'guide' && (
        <GuideView
          places={places}
          onViewOnMap={(place) => {
            setMapFocus({ lat: place.lat, lon: place.lon, id: place.id });
            setActiveTab('map');
          }}
        />
      )}

      {/* Barra de navegación inferior fija */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 z-[1100] flex items-center justify-around px-2">
        <button
          onClick={() => setActiveTab('forecast')}
          className={`flex flex-col items-center justify-center gap-1 w-24 py-1.5 rounded-xl transition-colors ${
            activeTab === 'forecast' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Waves size={20} />
          <span className="text-[11px] font-semibold">Pronóstico</span>
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center justify-center gap-1 w-24 py-1.5 rounded-xl transition-colors ${
            activeTab === 'map' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapIcon size={20} />
          <span className="text-[11px] font-semibold">Mapa</span>
        </button>

        <button
          onClick={() => setActiveTab('guide')}
          className={`flex flex-col items-center justify-center gap-1 w-24 py-1.5 rounded-xl transition-colors ${
            activeTab === 'guide' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass size={20} />
          <span className="text-[11px] font-semibold">Guía</span>
        </button>
      </nav>
    </div>
  );
}