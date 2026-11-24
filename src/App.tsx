import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
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
import {
  findBestSessionWindow,
  findCurrentHourIndex,
  buildDailySummaries,
  type SpotConfig,
} from './services/surfRating';
import { formatDayLabel, formatHourHHMM, formatLastUpdated } from './utils/surfFormat';
import CurrentConditions from './components/CurrentConditions';
import FiveDaySummary from './components/FiveDaySummary';
import HourlyForecastList, { type DayGroup } from './components/HourlyForecastList';
import type { PlaceItem } from './components/SurfMap';
import GuideView from './components/GuideView';
import TideModal from './components/TideModal';
import TideCurveChart from './components/TideCurveChart';
import TopSpotsModal from './components/TopSpotsModal';

const SurfMap = lazy(() => import('./components/SurfMap'));
import {
  ChevronDown,
  ChevronRight,
  Waves,
  Video,
  Map as MapIcon,
  Compass,
  AlertCircle,
  RotateCw,
  WifiOff,
  BarChart3,
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
  const [isTopSpotsOpen, setIsTopSpotsOpen] = useState(false);
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

  // Estado compartido bajo demanda de todos los spots (reutilizado entre Mapa y "Mejores ahora")
  const [spotsBatchRequest, setSpotsBatchRequest] = useState(0);
  const [spotsBatchState, setSpotsBatchState] = useState<{
    request: number;
    status: 'ready' | 'error';
    data: Record<string, ForecastData>;
    error: string | null;
  } | null>(null);
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

  const hasNetworkResult = forecastState !== null && forecastState.spotId === selectedSpot.id && forecastState.attempt === retryCount;

  const isNetworkReady = hasNetworkResult && forecastState.status === 'ready';
  const isNetworkError = hasNetworkResult && forecastState.status === 'error';

  const forecast: ForecastData[] = isNetworkReady ? forecastState.data : (cachedEntry?.data ?? []);
  const dataFetchedAt: number = isNetworkReady ? forecastState.fetchedAt : (cachedEntry?.fetchedAt ?? nowMs);

  const loading = !hasNetworkResult && !cachedEntry;
  const isRefreshing = !hasNetworkResult && cachedEntry !== null;
  const offlineError = isNetworkError && cachedEntry !== null ? forecastState.error : null;
  const blockingError = isNetworkError && cachedEntry === null ? forecastState.error : null;

  const needsSpotsBatch = activeTab === 'map' || isTopSpotsOpen;
  const hasBatchResult =
    spotsBatchState !== null && spotsBatchState.request === spotsBatchRequest;
  const spotsCurrent = spotsBatchState?.data ?? {};
  const loadingSpotsBatch = needsSpotsBatch && !hasBatchResult;
  const spotsBatchError =
    hasBatchResult && spotsBatchState.status === 'error' ? spotsBatchState.error : null;

  const lastUpdatedText = formatLastUpdated(dataFetchedAt, nowMs);
  const updatedLabel = isRefreshing ? lastUpdatedText ? `Última actualización: ${lastUpdatedText} · Actualizando...` : 'Actualizando...' : lastUpdatedText ? `Última actualización: ${lastUpdatedText}` : null;

  const openTideModal = (dateKey?: string) => {
    setTideModalDate(dateKey);
    setIsTideModalOpen(true);
  };

  const handleSelectSpot = (spot: SpotConfig) => {
    setSelectedSpot(spot);
    setExpandedTime(null);
    setNowMs(Date.now());
  };

  const handleScrollToDay = (dayKey: string) => {
    const el = document.getElementById(`forecast-day-${dayKey}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // Cargar estado actual de todos los spots bajo demanda (Mapa o "Mejores ahora")
  useEffect(() => {
    if (!needsSpotsBatch || hasBatchResult) return;

    let cancelled = false;
    const request = spotsBatchRequest;

    fetchAllSpotsCurrent(spots)
      .then((data) => {
        if (cancelled) return;
        setSpotsBatchState({
          request,
          status: 'ready',
          data,
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSpotsBatchState((prev) => ({
          request,
          status: 'error',
          data: prev?.data ?? {},
          error: 'No pudimos cargar las playas. Revisá tu conexión e intentá de nuevo.',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [needsSpotsBatch, hasBatchResult, spotsBatchRequest, spots]);

  const dailyTidePeaks = getDailyTidePeaks(forecast);

  // Única fuente de verdad para la hora local en curso (floor a HH:00, sin redondear después de y media)
  const currentIndex = findCurrentHourIndex(forecast, nowMs);
  const currentHourItem: ForecastData | null = currentIndex >= 0 ? forecast[currentIndex] : null;
  const currentHourMs = currentHourItem ? new Date(currentHourItem.time).getTime() : nowMs;

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

  // Inicio del bloque visible actual:
  // - Cada 1h: la hora exacta en curso (currentHourItem)
  // - Cada 3h / 6h: el bloque de hoy que contiene la hora en curso (ej. 11:45 -> 09:00 en 3h, 06:00 en 6h)
  const blockStartDate = new Date(currentHourMs);
  if (stepHours > 1) {
    const flooredHour = Math.floor(blockStartDate.getHours() / stepHours) * stepHours;
    blockStartDate.setHours(flooredHour, 0, 0, 0);
  } 
  else {
    blockStartDate.setMinutes(0, 0, 0);
  }
  const visibleStartMs = blockStartDate.getTime();

  const upcomingForecast = forecast.filter((item) => new Date(item.time).getTime() >= visibleStartMs);

  const visibleForecast = upcomingForecast.filter((item, idx) => {
    if (stepHours === 1) return idx < 120;
    const hour = new Date(item.time).getHours();
    return hour % stepHours === 0;
  });

  // Agrupar filas horarias por día y calcular la mejor ventana diurna por fecha
  const groupedDays: DayGroup[] = [];
  visibleForecast.forEach((item) => {
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
        currentHourMs
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
    group.items.push({ item });
  });

  const dailySummaries = buildDailySummaries(
    forecast,
    selectedSpot,
    5,
    nowMs,
    groupedDays.map((g) => g.dateKey),
    currentHourItem?.time ?? null
  );

  const isMapTab = activeTab === 'map';
  const todayTidePeaks = dailyTidePeaks[todayKey] ?? [];
  const hasTodayTideData = (fullDayHoursMap.get(todayKey) ?? []).some(
    (item) => typeof item.tideHeight === 'number' && Number.isFinite(item.tideHeight)
  );

  const renderStepButtons = () => (
    <div className="inline-flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
      {VALID_STEP_HOURS.map((step) => (
        <button
          key={step}
          type="button"
          onClick={() => {
            setStepHours(step);
            setExpandedTime(null);
          }}
          className={`px-3 py-1 text-xs rounded-lg transition-colors tabular-nums cursor-pointer ${
            stepHours === step
              ? 'bg-zinc-900 text-white font-medium'
              : 'text-zinc-600 hover:text-zinc-900 font-normal'
          }`}
        >
          Cada {step}h
        </button>
      ))}
    </div>
  );

  return (
    <div
      className={`bg-zinc-50 text-zinc-900 font-sans selection:bg-sky-200/70 ${
        isMapTab ? 'h-dvh overflow-hidden flex flex-col' : 'min-h-screen'
      }`}
    >
      {/* Header superior: siempre visible en Pronóstico; en Mapa/Guía visible solo en tablet/desktop (md+) */}
      <header
        className={`${
          activeTab === 'forecast' ? 'block' : 'hidden md:block'
        } ${
          isMapTab ? 'shrink-0' : 'sticky top-0'
        } z-20 bg-white/95 backdrop-blur-md border-b border-zinc-200`}
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5 space-y-2.5 lg:space-y-0">
          <div className="flex items-center justify-between gap-2 md:gap-4">
            <div className="flex items-center gap-4 lg:gap-6 shrink-0">
              <div className="flex items-center gap-2 shrink-0">
                <Waves size={18} strokeWidth={1.75} className="text-sky-700" />
                <h1 className="text-base font-medium text-zinc-900 tracking-tight">SurfMDQ</h1>
              </div>

              {/* Navegación principal en tablet/desktop */}
              <nav
                aria-label="Navegación principal"
                className="hidden md:flex items-center gap-1"
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('forecast')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                    activeTab === 'forecast'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/60 border border-transparent font-normal'
                  }`}
                >
                  <Waves size={14} strokeWidth={1.75} />
                  Pronóstico
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('map')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                    activeTab === 'map'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/60 border border-transparent font-normal'
                  }`}
                >
                  <MapIcon size={14} strokeWidth={1.75} />
                  Mapa
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('guide')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                    activeTab === 'guide'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/60 border border-transparent font-normal'
                  }`}
                >
                  <Compass size={14} strokeWidth={1.75} />
                  Guía
                </button>
              </nav>
            </div>

            {activeTab === 'forecast' && (
              <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-67.5 md:flex-none md:max-w-none">
                <div className="relative min-w-0 flex-1 md:w-56 lg:w-60 md:flex-none">
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

                <button
                  type="button"
                  onClick={() => setIsTopSpotsOpen(true)}
                  title="Mejores playas ahora"
                  aria-label="Ver mejores playas ahora"
                  className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-900 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                >
                  <BarChart3 size={16} strokeWidth={1.75} />
                </button>

                {selectedSpot.camUrl && (
                  <a
                    href={selectedSpot.camUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden lg:inline-flex items-center gap-1.5 h-9 text-xs font-medium text-zinc-800 hover:text-zinc-950 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 px-3 rounded-xl transition-colors shrink-0"
                  >
                    <Video size={14} strokeWidth={1.75} className="text-zinc-600" />
                    Cámara
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Fila secundaria en mobile/tablet (< lg): selector de intervalo y cámara */}
          {activeTab === 'forecast' && (
            <div className="flex items-center justify-between gap-2 lg:hidden">
              {renderStepButtons()}

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
          )}
        </div>
      </header>

      {/* Pestaña 1: Pronóstico */}
      {activeTab === 'forecast' && (
        <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10">
          <main className="max-w-7xl mx-auto px-4 pt-4">
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
                className="max-w-md mx-auto bg-white border border-zinc-200 rounded-2xl p-6 my-8 text-center space-y-3"
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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
                {/* Columna izquierda: Condiciones actuales + curva de marea de hoy (sticky en desktop) */}
                <div className="lg:col-span-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto no-scrollbar space-y-3">
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

                  {currentHourItem && (
                    <CurrentConditions
                      spot={selectedSpot}
                      currentPoint={currentHourItem}
                      currentTideState={currentTideState}
                      nextTidePeak={nextTidePeak}
                      updatedLabel={offlineError ? null : updatedLabel}
                      onOpenTideModal={openTideModal}
                    />
                  )}

                  {/* Curva de marea de hoy inline (solo desktop) */}
                  {hasTodayTideData && (
                    <button
                      type="button"
                      onClick={() => openTideModal(todayKey)}
                      aria-label="Ver curva de marea completa de 5 días"
                      className="hidden lg:block w-full text-left bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl p-3 space-y-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-1.5 tabular-nums">
                          <span className="text-xs font-medium text-zinc-700">Marea hoy</span>
                          {currentTideState && (
                            <span className="text-xs font-normal text-zinc-500">
                              · {currentTideState.height.toFixed(1)} m
                              {currentTideState.trend && (
                                <span className="ml-0.5 text-sky-700">
                                  {currentTideState.trend === 'rising' ? '↑' : '↓'}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-sky-700 shrink-0">
                          Ver 5 días
                          <ChevronRight size={13} strokeWidth={1.75} />
                        </span>
                      </div>

                      <TideCurveChart
                        forecast={forecast}
                        dateKey={todayKey}
                        dayPeaks={todayTidePeaks}
                        nowMs={nowMs}
                        compact
                      />

                      {todayTidePeaks.length > 0 && (
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 tabular-nums pt-0.5">
                          {todayTidePeaks.map((peak, idx) => (
                            <span key={peak.time}>
                              {idx > 0 && <span className="text-zinc-300 mr-2">·</span>}
                              <span
                                className={
                                  peak.type === 'high' ? 'text-sky-700' : 'text-zinc-400'
                                }
                              >
                                {peak.type === 'high' ? '▲' : '▼'}
                              </span>{' '}
                              {formatHourHHMM(peak.time)} ({peak.height.toFixed(1)}m)
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )}
                </div>

                {/* Columna derecha: Resumen 5 días + Pronóstico horario */}
                <div className="lg:col-span-8 min-w-0 space-y-5">
                  {dailySummaries.length > 0 && (
                    <FiveDaySummary
                      spot={selectedSpot}
                      summaries={dailySummaries}
                      forecast={forecast}
                      dailyTidePeaks={dailyTidePeaks}
                      todayKey={todayKey}
                      currentHourTime={currentHourItem?.time ?? null}
                      nowMs={nowMs}
                      onScrollToDay={handleScrollToDay}
                    />
                  )}

                  {/* Selector de intervalo en desktop (sin engrosar el header sticky) */}
                  <div className="hidden lg:flex items-center justify-between gap-2">
                    <span className="text-xs font-normal text-zinc-500 uppercase tracking-wider px-1">
                      Pronóstico horario
                    </span>
                    {renderStepButtons()}
                  </div>

                  <HourlyForecastList
                    spot={selectedSpot}
                    groupedDays={groupedDays}
                    dailyTidePeaks={dailyTidePeaks}
                    currentHourTime={currentHourItem?.time ?? null}
                    stepHours={stepHours}
                    todayKey={todayKey}
                    expandedTime={expandedTime}
                    onToggleExpand={(time) =>
                      setExpandedTime((prev) => (prev === time ? null : time))
                    }
                    onFocusHour={(time) => setExpandedTime(time)}
                    onOpenTideModal={openTideModal}
                  />
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Pestaña 2: Mapa Interactivo */}
      {activeTab === 'map' && (
        <main className="flex-1 min-h-0 overflow-hidden p-0 isolate">
          <Suspense
            fallback={
              <div className="h-full w-full flex flex-col items-center justify-center bg-zinc-100 space-y-2.5">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-300 border-t-zinc-800" />
                <p className="text-zinc-600 text-xs font-normal">Cargando mapa...</p>
              </div>
            }
          >
            <SurfMap
              spots={spots}
              spotsCurrent={spotsCurrent}
              places={places}
              loading={loadingSpotsBatch}
              focusTarget={mapFocus}
              onOpenSpotForecast={(spot) => {
                handleSelectSpot(spot);
                setActiveTab('forecast');
              }}
            />
          </Suspense>
        </main>
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

      {/* Modal comparador "Mejores ahora" */}
      <TopSpotsModal
        isOpen={isTopSpotsOpen}
        onClose={() => setIsTopSpotsOpen(false)}
        spots={spots}
        spotsCurrent={spotsCurrent}
        selectedSpotId={selectedSpot.id}
        loading={loadingSpotsBatch}
        error={spotsBatchError}
        onRefresh={() => setSpotsBatchRequest((n) => n + 1)}
        onSelectSpot={(spot) => handleSelectSpot(spot)}
      />

      {/* Modal interactivo de mareas */}
      <TideModal
        isOpen={isTideModalOpen}
        onClose={() => setIsTideModalOpen(false)}
        spotName={selectedSpot.name}
        forecast={forecast}
        initialDate={tideModalDate}
        nowMs={nowMs}
      />

      {/* Barra de navegación inferior fija (solo mobile; en md+ se usa la navegación superior) */}
      <nav
        className={`md:hidden ${
          isMapTab ? 'relative shrink-0' : 'fixed bottom-0 left-0 right-0'
        } pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-md border-t border-zinc-200 z-1100`}
      >
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-around px-2">
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
