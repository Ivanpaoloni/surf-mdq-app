import { useState, useEffect, useMemo } from 'react';
import spotsData from './data/spots.json';
import placesData from './data/places.json';
import {
  fetchForecast,
  fetchAllSpotsCurrent,
  getDailyTidePeaks,
  getCurrentTideState,
  readForecastCache,
  writeForecastCache,
  type ForecastData,
  type TidePeak,
} from './services/openMeteo';
import { findBestSessionWindow, type SpotConfig } from './services/surfRating';
import { formatDayLabel, formatLastUpdated } from './utils/surfFormat';
import CurrentConditions from './components/CurrentConditions';
import HourlyForecastList, { type DayGroup } from './components/HourlyForecastList';
import SurfMap, { type PlaceItem } from './components/SurfMap';
import GuideView from './components/GuideView';
import TideModal from './components/TideModal';
import {
  ChevronDown,
  Waves,
  Video,
  Map as MapIcon,
  Compass,
  AlertCircle,
  RotateCw,
  WifiOff,
} from 'lucide-react';

type ActiveTab = 'forecast' | 'map' | 'guide';

const STORAGE_SPOT_KEY = 'surfmdq:selectedSpotId';
const STORAGE_INTERVAL_KEY = 'surfmdq:forecastInterval';
const VALID_STEP_HOURS = [1, 3, 6] as const;

function getLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getInitialSpot(spots: SpotConfig[]): SpotConfig {
  try {
    const urlSpotId = new URLSearchParams(window.location.search).get('spot');
    if (urlSpotId) {
      const foundInUrl = spots.find((s) => s.id === urlSpotId);
      if (foundInUrl) return foundInUrl;
    }
  } catch {
    // Ignorar errores al leer window.location
  }

  try {
    const savedSpotId = window.localStorage.getItem(STORAGE_SPOT_KEY);
    if (savedSpotId) {
      const foundInStorage = spots.find((s) => s.id === savedSpotId);
      if (foundInStorage) return foundInStorage;
    }
  } catch {
    // Ignorar errores de localStorage (modo privado / almacenamiento restringido)
  }

  return spots[0];
}

function getInitialStepHours(): number {
  try {
    const saved = window.localStorage.getItem(STORAGE_INTERVAL_KEY);
    if (saved !== null) {
      const parsed = Number(saved);
      if ((VALID_STEP_HOURS as readonly number[]).includes(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignorar errores de localStorage (modo privado / almacenamiento restringido)
  }

  return 3;
}

export default function App() {
  const spots: SpotConfig[] = spotsData as SpotConfig[];
  const places: PlaceItem[] = placesData as PlaceItem[];

  const [activeTab, setActiveTab] = useState<ActiveTab>('forecast');
  const [selectedSpot, setSelectedSpot] = useState<SpotConfig>(() => getInitialSpot(spots));
  const [stepHours, setStepHours] = useState<number>(() => getInitialStepHours());
  const [expandedTime, setExpandedTime] = useState<string | null>(null);
  const [isTideModalOpen, setIsTideModalOpen] = useState(false);
  const [tideModalDate, setTideModalDate] = useState<string | undefined>(undefined);
  const [retryCount, setRetryCount] = useState(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [forecastState, setForecastState] = useState<{
    spotId: string;
    attempt: number;
    status: 'ready' | 'error';
    data: ForecastData[];
    fetchedAt: number;
    error: string | null;
  } | null>(null);

  // Estado del mapa (se carga por lote la primera vez que abrís la pestaña Mapa)
  const [mapState, setMapState] = useState<{
    loaded: boolean;
    data: Record<string, ForecastData>;
  }>({ loaded: false, data: {} });
  const [mapFocus, setMapFocus] = useState<{ lat: number; lon: number; id?: string } | null>(null);

  // Mantener nowMs actualizado cada minuto para etiquetas de antigüedad y hora actual real en modo offline
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Agrupar spots por zona preservando orden Norte -> Sur de spots.json
  const spotsByZone = useMemo(() => {
    const groups: { zone: string; items: SpotConfig[] }[] = [];
    spots.forEach((spot) => {
      const existing = groups.find((g) => g.zone === spot.zone);
      if (existing) {
        existing.items.push(spot);
      } else {
        groups.push({ zone: spot.zone, items: [spot] });
      }
    });
    return groups;
  }, [spots]);

  // Leer caché local del spot actual (válida hasta 24h)
  const cachedEntry = useMemo(
    () => readForecastCache(selectedSpot.id, nowMs),
    [selectedSpot.id, nowMs]
  );

  const hasNetworkResult =
    forecastState !== null &&
    forecastState.spotId === selectedSpot.id &&
    forecastState.attempt === retryCount;

  const isNetworkReady = hasNetworkResult && forecastState.status === 'ready';
  const isNetworkError = hasNetworkResult && forecastState.status === 'error';

  const forecast: ForecastData[] = isNetworkReady
    ? forecastState.data
    : (cachedEntry?.data ?? []);
  const dataFetchedAt: number = isNetworkReady
    ? forecastState.fetchedAt
    : (cachedEntry?.fetchedAt ?? nowMs);

  const loading = !hasNetworkResult && !cachedEntry;
  const isRefreshing = !hasNetworkResult && cachedEntry !== null;
  const offlineError = isNetworkError && cachedEntry !== null ? forecastState.error : null;
  const blockingError = isNetworkError && cachedEntry === null ? forecastState.error : null;
  const loadingMap = activeTab === 'map' && !mapState.loaded;

  const lastUpdatedText = formatLastUpdated(dataFetchedAt, nowMs);
  const updatedLabel = isRefreshing
    ? lastUpdatedText
      ? `Última actualización: ${lastUpdatedText} · Actualizando...`
      : 'Actualizando...'
    : lastUpdatedText
      ? `Última actualización: ${lastUpdatedText}`
      : null;

  const openTideModal = (dateKey?: string) => {
    setTideModalDate(dateKey);
    setIsTideModalOpen(true);
  };

  const handleSelectSpot = (spot: SpotConfig) => {
    setSelectedSpot(spot);
    setExpandedTime(null);
    setNowMs(Date.now());
  };

  const handleRetryForecast = () => {
    setNowMs(Date.now());
    setRetryCount((c) => c + 1);
  };

  // Persistir spot seleccionado en localStorage y sincronizar ?spot=<id> sin ensuciar el historial
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_SPOT_KEY, selectedSpot.id);
    } catch {
      // Ignorar errores de localStorage
    }

    try {
      const nextUrl = new URL(window.location.href);
      if (nextUrl.searchParams.get('spot') !== selectedSpot.id) {
        nextUrl.searchParams.set('spot', selectedSpot.id);
        window.history.replaceState(null, '', nextUrl.toString());
      }
    } catch {
      // Ignorar errores de History API
    }
  }, [selectedSpot]);

  // Persistir intervalo horario elegido en localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_INTERVAL_KEY, String(stepHours));
    } catch {
      // Ignorar errores de localStorage
    }
  }, [stepHours]);

  // Cargar pronóstico (stale-while-revalidate) con protección contra race conditions
  useEffect(() => {
    let cancelled = false;
    const spotId = selectedSpot.id;
    const attempt = retryCount;

    fetchForecast(selectedSpot)
      .then((data) => {
        if (cancelled) return;
        const freshNow = Date.now();
        writeForecastCache(spotId, data, freshNow);
        setNowMs(freshNow);
        setForecastState({
          spotId,
          attempt,
          status: 'ready',
          data,
          fetchedAt: freshNow,
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        const failNow = Date.now();
        setNowMs(failNow);
        setForecastState({
          spotId,
          attempt,
          status: 'error',
          data: [],
          fetchedAt: failNow,
          error: 'No pudimos cargar el pronóstico. Revisá tu conexión e intentá de nuevo.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSpot, retryCount]);

  // Cargar estado actual de todos los spots la primera vez que se abre Mapa
  useEffect(() => {
    if (activeTab !== 'map' || mapState.loaded) return;

    let cancelled = false;
    fetchAllSpotsCurrent(spots)
      .then((data) => {
        if (!cancelled) setMapState({ loaded: true, data });
      })
      .catch(() => {
        if (!cancelled) setMapState((prev) => ({ ...prev, loaded: true }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, spots, mapState.loaded]);

  const dailyTidePeaks = getDailyTidePeaks(forecast);

  // Hora actual más cercana a la hora REAL (nowMs), incluso usando caché de hace > 6h
  let currentPoint: ForecastData | null = null;
  if (forecast.length > 0) {
    currentPoint = forecast.reduce((closest, item) => {
      const diffItem = Math.abs(new Date(item.time).getTime() - nowMs);
      const diffClosest = Math.abs(new Date(closest.time).getTime() - nowMs);
      return diffItem < diffClosest ? item : closest;
    }, forecast[0]);
  }

  const allTidePeaks: TidePeak[] = Object.values(dailyTidePeaks).flat();
  const nextTidePeak: TidePeak | null =
    allTidePeaks.find((peak) => new Date(peak.time).getTime() >= nowMs) ?? null;
  const currentTideState = getCurrentTideState(forecast, nowMs);

  // Mapa completo de horas por día (YYYY-MM-DD) para calcular la mejor ventana con resolución horaria real
  const fullDayHoursMap = new Map<string, ForecastData[]>();
  for (const item of forecast) {
    const dk = item.time.slice(0, 10);
    const list = fullDayHoursMap.get(dk);
    if (list) list.push(item);
    else fullDayHoursMap.set(dk, [item]);
  }

  const todayKey = getLocalDateKey(new Date(nowMs));

  // Filtrar horas pasadas únicamente para el listado horario (manteniendo 24h completas en `forecast` para mareas y ventanas)
  const upcomingStartMs = nowMs - 60 * 60 * 1000;
  const upcomingForecast = forecast.filter(
    (item) => new Date(item.time).getTime() >= upcomingStartMs
  );

  const visibleForecast = upcomingForecast.filter((item, idx) => {
    if (stepHours === 1) return idx < 48;
    const hour = new Date(item.time).getHours();
    return hour % stepHours === 0;
  });

  // Agrupar filas horarias por día y calcular la mejor ventana diurna por fecha
  const groupedDays: DayGroup[] = [];
  visibleForecast.forEach((item, idx) => {
    const timeObj = new Date(item.time);
    const key = timeObj.toDateString();
    const dateKey = item.time.slice(0, 10);
    let group = groupedDays[groupedDays.length - 1];
    if (!group || group.key !== key) {
      const fullDayHours = fullDayHoursMap.get(dateKey) ?? [];
      const bestWindow = findBestSessionWindow(
        fullDayHours,
        selectedSpot,
        dateKey === todayKey,
        nowMs
      );
      group = {
        key,
        dateKey,
        label: formatDayLabel(timeObj),
        bestWindow,
        items: [],
      };
      groupedDays.push(group);
    }
    group.items.push({ item, isCurrent: idx === 0 && dateKey === todayKey });
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-sky-200/70">
      {/* Pestaña 1: Pronóstico */}
      {activeTab === 'forecast' && (
        <div className="pb-20">
          <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-zinc-200">
            <div className="max-w-2xl mx-auto px-4 py-2.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <Waves size={18} strokeWidth={1.75} className="text-sky-700" />
                  <h1 className="text-base font-medium text-zinc-900 tracking-tight">
                    SurfMDQ
                  </h1>
                </div>

                <div className="relative flex-1 max-w-58.75">
                  <select
                    aria-label="Seleccionar playa"
                    className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl py-1.5 pl-3 pr-8 text-sm font-medium text-zinc-900 focus:outline-none focus:border-zinc-400 truncate transition-colors"
                    value={selectedSpot.id}
                    onChange={(e) => {
                      const found = spots.find((s) => s.id === e.target.value);
                      if (found) handleSelectSpot(found);
                    }}
                  >
                    {spotsByZone.map((zoneGroup) => (
                      <optgroup
                        key={zoneGroup.zone}
                        label={zoneGroup.zone}
                        className="bg-white text-zinc-500"
                      >
                        {zoneGroup.items.map((s) => (
                          <option key={s.id} value={s.id} className="bg-white text-zinc-900">
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
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
                  {VALID_STEP_HOURS.map((step) => (
                    <button
                      key={step}
                      type="button"
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

          <main className="max-w-2xl mx-auto px-4 pt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-28 space-y-3">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-zinc-200 border-t-zinc-800" />
                <p className="text-zinc-600 text-sm font-normal">
                  Consultando boyas y satélites...
                </p>
              </div>
            ) : blockingError ? (
              <div
                role="alert"
                className="bg-white border border-zinc-200 rounded-2xl p-6 my-8 text-center space-y-3"
              >
                <div className="mx-auto w-9 h-9 rounded-full bg-rose-50 border border-rose-200/70 flex items-center justify-center">
                  <AlertCircle size={18} strokeWidth={1.75} className="text-rose-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-900">Error de conexión</p>
                  <p className="text-sm font-normal text-zinc-600">{blockingError}</p>
                </div>
                <button
                  type="button"
                  onClick={handleRetryForecast}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                >
                  <RotateCw size={14} strokeWidth={1.75} />
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Aviso no bloqueante cuando se muestran datos cacheados sin señal */}
                {offlineError && (
                  <div
                    role="status"
                    className="flex items-center justify-between gap-3 bg-amber-50/80 border border-amber-200/80 rounded-xl px-3 py-2.5 text-amber-900"
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <WifiOff
                        size={14}
                        strokeWidth={1.75}
                        className="text-amber-700 shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 leading-snug">
                        <div className="text-xs font-medium text-amber-900">Sin conexión</div>
                        {lastUpdatedText && (
                          <div className="text-[11px] font-normal text-amber-800/80 tabular-nums mt-0.5">
                            Última actualización: {lastUpdatedText}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRetryForecast}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 text-xs text-amber-900 hover:bg-amber-50 font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    >
                      <RotateCw size={11} strokeWidth={1.75} />
                      Reintentar
                    </button>
                  </div>
                )}

                {currentPoint && (
                  <CurrentConditions
                    spot={selectedSpot}
                    currentPoint={currentPoint}
                    currentTideState={currentTideState}
                    nextTidePeak={nextTidePeak}
                    updatedLabel={offlineError ? null : updatedLabel}
                    onOpenTideModal={openTideModal}
                  />
                )}

                <HourlyForecastList
                  spot={selectedSpot}
                  groupedDays={groupedDays}
                  dailyTidePeaks={dailyTidePeaks}
                  expandedTime={expandedTime}
                  onToggleExpand={(time) =>
                    setExpandedTime((prev) => (prev === time ? null : time))
                  }
                  onFocusHour={(time) => setExpandedTime(time)}
                  onOpenTideModal={openTideModal}
                />
              </div>
            )}
          </main>
        </div>
      )}

      {/* Pestaña 2: Mapa Interactivo */}
      {activeTab === 'map' && (
        <SurfMap
          spots={spots}
          spotsCurrent={mapState.data}
          places={places}
          loading={loadingMap}
          focusTarget={mapFocus}
          onOpenSpotForecast={(spot) => {
            handleSelectSpot(spot);
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

      {/* Modal interactivo de mareas */}
      <TideModal
        isOpen={isTideModalOpen}
        onClose={() => setIsTideModalOpen(false)}
        spotName={selectedSpot.name}
        forecast={forecast}
        initialDate={tideModalDate}
        nowMs={nowMs}
      />

      {/* Barra de navegación inferior fija */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-t border-zinc-200 z-1100">
        <div className="max-w-2xl mx-auto h-full flex items-center justify-around px-2">
          <button
            type="button"
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
            type="button"
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
            type="button"
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
