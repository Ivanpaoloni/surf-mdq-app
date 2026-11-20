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
  ChevronDown,
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

  const label = date.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getStarsLabel(stars: number): string {
  if (stars === 0) return 'Flat / Muy chico';
  if (stars === 1) return 'Flojo';
  if (stars === 2) return 'Surfeable';
  if (stars === 3) return 'Bueno';
  if (stars === 4) return 'Muy bueno';
  return 'Épico';
}

export default function App() {
  const spots: SpotConfig[] = spotsData as SpotConfig[];
  const places: PlaceItem[] = placesData as PlaceItem[];

  const [activeTab, setActiveTab] = useState<ActiveTab>('forecast');
  const [selectedSpot, setSelectedSpot] = useState<SpotConfig>(spots[0]);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [stepHours, setStepHours] = useState<number>(3);
  const [loading, setLoading] = useState(true);
  const [expandedTime, setExpandedTime] = useState<string | null>(null);

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

  // Agrupar filas horarias por día en contenedores blancos con divisores suaves
  const groupedDays: { key: string; label: string; items: { item: ForecastData; isCurrent: boolean }[] }[] = [];
  visibleForecast.forEach((item, idx) => {
    const timeObj = new Date(item.time);
    const key = timeObj.toDateString();
    let group = groupedDays[groupedDays.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatDayLabel(timeObj), items: [] };
      groupedDays.push(group);
    }
    group.items.push({ item, isCurrent: idx === 0 });
  });

  const renderStars = (count: number) => (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={14}
          strokeWidth={1.75}
          fill={i < count ? 'currentColor' : 'none'}
          className={i < count ? 'text-amber-500' : 'text-zinc-300'}
        />
      ))}
    </div>
  );

  const getWindTextColor = (quality: string) => {
    if (quality === 'offshore') return 'text-emerald-700';
    if (quality === 'cross') return 'text-amber-700';
    return 'text-rose-700';
  };

  const getWindDotColor = (quality: string) => {
    if (quality === 'offshore') return 'bg-emerald-600';
    if (quality === 'cross') return 'bg-amber-500';
    return 'bg-rose-600';
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-sky-200/70">
      {/* Pestaña 1: Pronóstico */}
      {activeTab === 'forecast' && (
        <div className="pb-20">
          <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-zinc-200">
            <div className="max-w-xl mx-auto px-4 py-2.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <Waves size={18} strokeWidth={1.75} className="text-sky-700" />
                  <h1 className="text-base font-medium text-zinc-900 tracking-tight">
                    SurfMDQ
                  </h1>
                </div>

                <div className="relative flex-1 max-w-[235px]">
                  <select
                    aria-label="Seleccionar playa"
                    className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl py-1.5 pl-3 pr-8 text-sm font-medium text-zinc-900 focus:outline-none focus:border-zinc-400 truncate transition-colors"
                    value={selectedSpot.id}
                    onChange={(e) => {
                      const found = spots.find((s) => s.id === e.target.value);
                      if (found) {
                        setSelectedSpot(found);
                        setExpandedTime(null);
                      }
                    }}
                  >
                    {spots.map((s) => (
                      <option key={s.id} value={s.id} className="bg-white text-zinc-900">
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
                  {[1, 3, 6].map((step) => (
                    <button
                      key={step}
                      onClick={() => {
                        setStepHours(step);
                        setExpandedTime(null);
                      }}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors tabular-nums ${
                        stepHours === step
                          ? 'bg-zinc-900 text-white font-medium'
                          : 'text-zinc-600 hover:text-zinc-900 font-normal'
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
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 hover:text-zinc-950 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 px-3 py-1.5 rounded-xl transition-colors"
                  >
                    <Video size={14} strokeWidth={1.75} className="text-zinc-600" />
                    Cámara
                  </a>
                )}
              </div>
            </div>
          </header>

          <main className="max-w-xl mx-auto px-4 pt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-28 space-y-3">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-zinc-200 border-t-zinc-800" />
                <p className="text-zinc-600 text-sm font-normal">
                  Consultando boyas y satélites...
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {groupedDays.map((group) => (
                  <section key={group.key} className="space-y-2">
                    <h2 className="px-1 text-sm font-medium text-zinc-600">
                      {group.label}
                    </h2>

                    <div className="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100 overflow-hidden">
                      {group.items.map(({ item: f, isCurrent }) => {
                        const rating = calculateSurfRating(f, selectedSpot);
                        const timeObj = new Date(f.time);
                        const hour = timeObj.getHours();
                        const isDawn = hour >= 0 && hour <= 5;
                        const isExpanded = expandedTime === f.time;
                        const timeStr = timeObj.toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        });

                        return (
                          <div key={f.time}>
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() =>
                                setExpandedTime((prev) => (prev === f.time ? null : f.time))
                              }
                              className={`relative w-full text-left px-4 py-3.5 flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-zinc-50 active:bg-zinc-100 ${
                                isDawn && !isExpanded ? 'opacity-60 bg-zinc-50/70' : ''
                              }`}
                            >
                              {isCurrent && (
                                <span
                                  aria-hidden="true"
                                  className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-sky-700"
                                />
                              )}

                              {/* Columna izquierda: Hora y estrellas */}
                              <div className="flex flex-col gap-1.5 w-[31%]">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-base font-medium tabular-nums text-zinc-900">
                                    {timeStr}
                                  </span>
                                  {isCurrent && (
                                    <span className="text-xs font-medium text-sky-700">
                                      Ahora
                                    </span>
                                  )}
                                </div>
                                {renderStars(rating.stars)}
                              </div>

                              {/* Columna central: Altura protagonista + período y dirección */}
                              <div className="flex flex-col items-center justify-center w-[36%]">
                                <span
                                  className={`text-xl leading-tight whitespace-nowrap tabular-nums ${
                                    rating.maxHeight === 0
                                      ? 'font-medium text-zinc-400'
                                      : 'font-semibold text-zinc-900'
                                  }`}
                                >
                                  {rating.maxHeight === 0 ? (
                                    'Flat'
                                  ) : (
                                    <>
                                      {rating.minHeight.toFixed(1)} - {rating.maxHeight.toFixed(1)}
                                      <span className="text-sm font-normal text-zinc-500 ml-0.5">
                                        m
                                      </span>
                                    </>
                                  )}
                                </span>

                                <div className="flex items-center gap-1 text-[13px] font-normal text-zinc-600 mt-1 tabular-nums">
                                  <span>{f.wavePeriod.toFixed(0)}s</span>
                                  <span className="text-zinc-300">·</span>
                                  <ArrowDown
                                    size={13}
                                    strokeWidth={1.75}
                                    className="text-zinc-500"
                                    style={{ transform: `rotate(${f.waveDirection}deg)` }}
                                  />
                                  <span>{degToCompass(f.waveDirection)}</span>
                                </div>
                              </div>

                              {/* Columna derecha: Viento */}
                              <div className="flex flex-col items-end w-[33%]">
                                <div className="flex items-center gap-1.5 text-base font-medium text-zinc-900 tabular-nums">
                                  <span
                                    aria-hidden="true"
                                    className={`h-2 w-2 rounded-full shrink-0 ${getWindDotColor(rating.windQuality)}`}
                                  />
                                  <span>
                                    {f.windSpeed.toFixed(0)}{' '}
                                    <span className="text-xs font-normal text-zinc-500">km/h</span>
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 text-[13px] font-normal mt-1">
                                  <ArrowDown
                                    size={13}
                                    strokeWidth={1.75}
                                    className={getWindTextColor(rating.windQuality)}
                                    style={{ transform: `rotate(${f.windDirection}deg)` }}
                                  />
                                  <span className="text-zinc-600">
                                    {degToCompass(f.windDirection)}
                                  </span>
                                  <span className="text-zinc-300">·</span>
                                  <span
                                    className={`capitalize ${getWindTextColor(rating.windQuality)}`}
                                  >
                                    {rating.windQuality}
                                  </span>
                                </div>
                              </div>
                            </button>

                            {/* Detalle técnico desplegable */}
                            {isExpanded && (
                              <div className="bg-zinc-50 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-700">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                                  <div>
                                    <div className="text-xs font-normal text-zinc-500">
                                      Mar abierto
                                    </div>
                                    <div className="font-medium text-zinc-900 tabular-nums mt-0.5">
                                      {f.rawWaveHeight !== undefined
                                        ? `mar: ${f.rawWaveHeight.toFixed(1)}m`
                                        : '—'}
                                      <span className="text-xs font-normal text-zinc-500">
                                        {' '}
                                        · est. {rating.estimatedHeight.toFixed(1)}m
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-normal text-zinc-500">
                                      Swell / Ola
                                    </div>
                                    <div className="font-medium text-zinc-900 tabular-nums mt-0.5">
                                      {f.waveHeight.toFixed(1)}m · {f.wavePeriod.toFixed(0)}s ·{' '}
                                      {degToCompass(f.waveDirection)} ({Math.round(f.waveDirection)}°)
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-normal text-zinc-500">
                                      Viento
                                    </div>
                                    <div className="font-medium text-zinc-900 tabular-nums mt-0.5">
                                      {f.windSpeed.toFixed(0)} km/h · {degToCompass(f.windDirection)}{' '}
                                      ({Math.round(f.windDirection)}°){' '}
                                      <span
                                        className={`capitalize ${getWindTextColor(rating.windQuality)}`}
                                      >
                                        {rating.windQuality}
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-normal text-zinc-500">
                                      Calidad
                                    </div>
                                    <div className="font-medium text-zinc-900 tabular-nums mt-0.5">
                                      {rating.stars}/5 ★ · {getStarsLabel(rating.stars)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </main>
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
            setExpandedTime(null);
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
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-t border-zinc-200 z-[1100]">
        <div className="max-w-xl mx-auto h-full flex items-center justify-around px-2">
          <button
            onClick={() => setActiveTab('forecast')}
            className={`flex flex-col items-center justify-center gap-0.5 w-24 py-1 rounded-lg transition-colors ${
              activeTab === 'forecast'
                ? 'text-sky-700 font-medium'
                : 'text-zinc-500 hover:text-zinc-800 font-normal'
            }`}
          >
            <Waves size={18} strokeWidth={1.75} />
            <span className="text-xs">Pronóstico</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center justify-center gap-0.5 w-24 py-1 rounded-lg transition-colors ${
              activeTab === 'map'
                ? 'text-sky-700 font-medium'
                : 'text-zinc-500 hover:text-zinc-800 font-normal'
            }`}
          >
            <MapIcon size={18} strokeWidth={1.75} />
            <span className="text-xs">Mapa</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`flex flex-col items-center justify-center gap-0.5 w-24 py-1 rounded-lg transition-colors ${
              activeTab === 'guide'
                ? 'text-sky-700 font-medium'
                : 'text-zinc-500 hover:text-zinc-800 font-normal'
            }`}
          >
            <Compass size={18} strokeWidth={1.75} />
            <span className="text-xs">Guía</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
