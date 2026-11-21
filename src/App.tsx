import { useState, useEffect } from 'react';
import spotsData from './data/spots.json';
import placesData from './data/places.json';
import {
  fetchForecast,
  fetchAllSpotsCurrent,
  getDailyTidePeaks,
  type ForecastData,
  type TidePeak,
} from './services/openMeteo';
import {
  calculateSurfRating,
  calculateWaveEnergyKj,
  type SpotConfig,
} from './services/surfRating';
import {
  getWetsuitRecommendation,
  getSwellDirectionQuality,
  getWeatherLabel,
  type SwellDirectionQuality,
} from './services/surfExtras';
import SurfMap, { type PlaceItem } from './components/SurfMap';
import GuideView from './components/GuideView';
import TideModal from './components/TideModal';
import {
  ChevronDown,
  ChevronRight,
  Waves,
  Star,
  ArrowDown,
  Video,
  Map as MapIcon,
  Compass,
  Sunrise,
  Sunset,
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Droplets,
} from 'lucide-react';

type ActiveTab = 'forecast' | 'map' | 'guide';

function WeatherIcon({
  code,
  isNight = false,
  className = 'w-4 h-4 shrink-0',
}: {
  code: number | null | undefined;
  isNight?: boolean;
  className?: string;
}) {
  if (typeof code !== 'number' || !Number.isFinite(code)) {
    return null;
  }
  if (code === 0) {
    return isNight ? (
      <Moon strokeWidth={1.75} className={`${className} text-indigo-500`} />
    ) : (
      <Sun strokeWidth={1.75} className={`${className} text-amber-500`} />
    );
  }
  if (code === 1 || code === 2) {
    return isNight ? (
      <CloudMoon strokeWidth={1.75} className={`${className} text-indigo-400`} />
    ) : (
      <CloudSun strokeWidth={1.75} className={`${className} text-amber-500`} />
    );
  }
  if (code === 3) {
    return <Cloud strokeWidth={1.75} className={`${className} text-zinc-500`} />;
  }
  if (code === 45 || code === 48) {
    return <CloudFog strokeWidth={1.75} className={`${className} text-zinc-400`} />;
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain strokeWidth={1.75} className={`${className} text-sky-600`} />;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <CloudSnow strokeWidth={1.75} className={`${className} text-sky-500`} />;
  }
  if (code >= 95 && code <= 99) {
    return <CloudLightning strokeWidth={1.75} className={`${className} text-amber-600`} />;
  }
  return <Cloud strokeWidth={1.75} className={`${className} text-zinc-400`} />;
}

function degToCompass(deg: number): string {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
  ];
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.round(normalized / 22.5) % 16];
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

function formatHourHHMM(isoTime: string): string {
  const timeObj = new Date(isoTime);
  if (Number.isNaN(timeObj.getTime())) return isoTime.slice(11, 16);
  return timeObj.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getSwellQualityColor(quality: SwellDirectionQuality): string {
  if (quality === 'good') return 'text-emerald-600';
  if (quality === 'fair') return 'text-amber-500';
  return 'text-rose-500';
}

function getEnergySegmentColor(level: 1 | 2 | 3 | 4): string {
  if (level === 1) return 'bg-zinc-400';
  if (level === 2) return 'bg-sky-600';
  if (level === 3) return 'bg-emerald-600';
  return 'bg-amber-500';
}

function getStarsLabel(stars: number): string {
  if (stars === 0) return 'Muy chico';
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
  const [fetchedAt, setFetchedAt] = useState<number>(() => Date.now());
  const [stepHours, setStepHours] = useState<number>(3);
  const [loading, setLoading] = useState(true);
  const [expandedTime, setExpandedTime] = useState<string | null>(null);
  const [isTideModalOpen, setIsTideModalOpen] = useState(false);
  const [tideModalDate, setTideModalDate] = useState<string | undefined>(undefined);

  const openTideModal = (dateKey?: string) => {
    setTideModalDate(dateKey);
    setIsTideModalOpen(true);
  };

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
        setFetchedAt(Date.now());
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

  const dailyTidePeaks = getDailyTidePeaks(forecast);

  // Hora actual más cercana para el panel de Condiciones Actuales
  let currentPoint: ForecastData | null = null;
  if (forecast.length > 0) {
    currentPoint = forecast.reduce((closest, item) => {
      const diffItem = Math.abs(new Date(item.time).getTime() - fetchedAt);
      const diffClosest = Math.abs(new Date(closest.time).getTime() - fetchedAt);
      return diffItem < diffClosest ? item : closest;
    }, forecast[0]);
  }

  const allTidePeaks: TidePeak[] = Object.values(dailyTidePeaks).flat();
  const nextTidePeak: TidePeak | null = currentPoint
    ? (allTidePeaks.find(
        (peak) => new Date(peak.time).getTime() >= new Date(currentPoint.time).getTime()
      ) ?? null)
    : null;

  const currentRating = currentPoint ? calculateSurfRating(currentPoint, selectedSpot) : null;
  const currentPrimarySwell = currentPoint
    ? (currentPoint.primarySwell ?? {
        height: currentPoint.waveHeight,
        period: currentPoint.wavePeriod,
        direction: currentPoint.waveDirection,
      })
    : null;
  const currentSecondarySwell = currentPoint?.secondarySwell ?? null;
  const currentEnergy = currentPrimarySwell
    ? calculateWaveEnergyKj(
        currentPrimarySwell.height,
        currentPrimarySwell.period,
        currentSecondarySwell
      )
    : null;
  const currentWaterTemp =
    typeof currentPoint?.waterTemp === 'number' && Number.isFinite(currentPoint.waterTemp)
      ? currentPoint.waterTemp
      : null;
  const currentAirTemp =
    typeof currentPoint?.airTemp === 'number' && Number.isFinite(currentPoint.airTemp)
      ? currentPoint.airTemp
      : null;
  const currentWetsuit = getWetsuitRecommendation(currentWaterTemp);
  const currentWeatherLabel = getWeatherLabel(currentPoint?.weatherCode);
  const currentIsNight = currentPoint?.isNight ?? false;
  const currentTideHeight =
    typeof currentPoint?.tideHeight === 'number' && Number.isFinite(currentPoint.tideHeight)
      ? currentPoint.tideHeight
      : null;
  const currentTideTrend = currentPoint?.tideTrend ?? null;

  const visibleForecast = forecast.filter((item, idx) => {
    if (stepHours === 1) return idx < 48;
    const hour = new Date(item.time).getHours();
    return hour % stepHours === 0;
  });

  // Agrupar filas horarias por día en contenedores blancos con divisores suaves
  const groupedDays: {
    key: string;
    dateKey: string;
    label: string;
    items: { item: ForecastData; isCurrent: boolean }[];
  }[] = [];

  visibleForecast.forEach((item, idx) => {
    const timeObj = new Date(item.time);
    const key = timeObj.toDateString();
    const dateKey = item.time.slice(0, 10);
    let group = groupedDays[groupedDays.length - 1];
    if (!group || group.key !== key) {
      group = { key, dateKey, label: formatDayLabel(timeObj), items: [] };
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

          <main className="max-w-2xl mx-auto px-4 pt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-28 space-y-3">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-zinc-200 border-t-zinc-800" />
                <p className="text-zinc-600 text-sm font-normal">
                  Consultando boyas y satélites...
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Panel compacto: Condiciones Actuales */}
                {currentPoint && currentRating && currentPrimarySwell && (
                  <section aria-label="Condiciones actuales" className="space-y-2">
                    <div className="px-1 flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-medium text-zinc-600">
                        Condiciones actuales
                      </h2>
                      <span className="text-xs font-normal text-zinc-500 tabular-nums">
                        {formatHourHHMM(currentPoint.time)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums">
                      {/* 1. Swell (2 cols) */}
                      <div className="col-span-2 bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                        <div className="text-[11px] font-normal text-zinc-500">Swell</div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-zinc-100 border border-zinc-200 text-[11px] font-medium text-zinc-700 shrink-0">
                              1
                            </span>
                            <span className="text-lg font-semibold text-zinc-900 leading-none">
                              {currentPrimarySwell.height.toFixed(1)}
                              <span className="text-xs font-normal text-zinc-500 ml-0.5">m</span>
                            </span>
                            <span className="text-zinc-300">·</span>
                            <span className="text-sm font-normal text-zinc-700">
                              {Math.round(currentPrimarySwell.period)} s
                            </span>
                            <span className="text-zinc-300">·</span>
                            <span className="inline-flex items-center gap-1 text-sm font-normal text-zinc-700">
                              <ArrowDown
                                size={14}
                                strokeWidth={2}
                                className={getSwellQualityColor(
                                  getSwellDirectionQuality(
                                    currentPrimarySwell.direction,
                                    selectedSpot.idealSwellDeg
                                  )
                                )}
                                style={{
                                  transform: `rotate(${currentPrimarySwell.direction}deg)`,
                                }}
                              />
                              {degToCompass(currentPrimarySwell.direction)}
                            </span>
                          </div>

                          {currentSecondarySwell && (
                            <div className="flex items-center gap-2 flex-wrap text-sm font-normal text-zinc-600">
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-zinc-100 border border-zinc-200 text-[11px] font-normal text-zinc-500 shrink-0">
                                2
                              </span>
                              <span>{currentSecondarySwell.height.toFixed(1)} m</span>
                              <span className="text-zinc-300">·</span>
                              <span>{Math.round(currentSecondarySwell.period)} s</span>
                              <span className="text-zinc-300">·</span>
                              <span className="inline-flex items-center gap-1">
                                <ArrowDown
                                  size={13}
                                  strokeWidth={2}
                                  className={getSwellQualityColor(
                                    getSwellDirectionQuality(
                                      currentSecondarySwell.direction,
                                      selectedSpot.idealSwellDeg
                                    )
                                  )}
                                  style={{
                                    transform: `rotate(${currentSecondarySwell.direction}deg)`,
                                  }}
                                />
                                {degToCompass(currentSecondarySwell.direction)}
                              </span>
                              {currentSecondarySwell.isWindWave && (
                                <span className="text-[11px] text-zinc-400">viento</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Viento */}
                      <div className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                        <div className="text-[11px] font-normal text-zinc-500">Viento</div>
                        <div>
                          <div className="flex items-center gap-1.5 text-base font-medium text-zinc-900 leading-snug">
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-full shrink-0 ${getWindDotColor(currentRating.windQuality)}`}
                            />
                            <span>
                              {Math.round(currentPoint.windSpeed)}{' '}
                              <span className="text-xs font-normal text-zinc-500">km/h</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs font-normal mt-1">
                            <ArrowDown
                              size={12}
                              strokeWidth={2}
                              className={getWindTextColor(currentRating.windQuality)}
                              style={{ transform: `rotate(${currentPoint.windDirection}deg)` }}
                            />
                            <span className="text-zinc-700">
                              {degToCompass(currentPoint.windDirection)}
                            </span>
                            <span className="text-zinc-300">·</span>
                            <span
                              className={`capitalize ${getWindTextColor(currentRating.windQuality)}`}
                            >
                              {currentRating.windQuality}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 3. Marea (clickeable -> abre gráfico interactivo) */}
                      <button
                        type="button"
                        onClick={() => openTideModal(currentPoint.time.slice(0, 10))}
                        aria-label="Abrir gráfico interactivo de marea"
                        className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-1.5 text-left cursor-pointer hover:border-zinc-300 active:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <span className="text-[11px] font-normal text-zinc-500">Marea</span>
                          <ChevronRight size={13} strokeWidth={1.75} className="text-zinc-400" />
                        </div>
                        <div>
                          {currentTideHeight !== null ? (
                            <div className="text-base font-medium text-zinc-900 leading-snug">
                              {currentTideHeight.toFixed(1)}{' '}
                              <span className="text-xs font-normal text-zinc-500">m</span>
                              {currentTideTrend && (
                                <span className="ml-1 text-sky-700">
                                  {currentTideTrend === 'rising' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm font-normal text-zinc-500">—</div>
                          )}

                          {currentTideTrend && (
                            <div className="text-xs font-normal text-zinc-600 mt-0.5">
                              {currentTideTrend === 'rising' ? 'Subiendo' : 'Bajando'}
                            </div>
                          )}

                          {nextTidePeak && (
                            <div className="text-[11px] font-normal text-zinc-500 mt-0.5 truncate">
                              {nextTidePeak.type === 'high' ? 'Pleamar' : 'Bajamar'}{' '}
                              {formatHourHHMM(nextTidePeak.time)} · {nextTidePeak.height.toFixed(1)} m
                            </div>
                          )}
                        </div>
                      </button>

                      {/* 4. Energía (combinada S1 + S2) */}
                      {currentEnergy && (
                        <div className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                          <div className="text-[11px] font-normal text-zinc-500">Energía</div>
                          <div>
                            <div className="flex items-baseline justify-between gap-1">
                              <span className="text-base font-medium text-zinc-900 leading-snug">
                                {currentEnergy.kj}{' '}
                                <span className="text-xs font-normal text-zinc-500">kJ</span>
                              </span>
                              <span className="text-xs font-normal text-zinc-600 capitalize">
                                {currentEnergy.label}
                              </span>
                            </div>

                            <div
                              aria-label={`Energía ${currentEnergy.label}`}
                              className="flex gap-1 mt-2"
                            >
                              {[1, 2, 3, 4].map((seg) => (
                                <span
                                  key={seg}
                                  className={`h-1.5 flex-1 rounded-full ${
                                    seg <= currentEnergy.level
                                      ? getEnergySegmentColor(currentEnergy.level)
                                      : 'bg-zinc-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 5. Clima (sin la palabra "Aire") + Agua y Traje */}
                      <div className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                        <div className="text-[11px] font-normal text-zinc-500">Clima</div>
                        <div className="space-y-1">
                          {(currentAirTemp !== null || currentWeatherLabel) && (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <WeatherIcon
                                code={currentPoint.weatherCode}
                                isNight={currentIsNight}
                                className="w-4 h-4 shrink-0"
                              />
                              {currentAirTemp !== null && (
                                <span className="text-base font-medium text-zinc-900 leading-none shrink-0">
                                  {Math.round(currentAirTemp)}°
                                </span>
                              )}
                              {currentWeatherLabel && (
                                <span className="text-xs font-normal text-zinc-600 truncate">
                                  {currentWeatherLabel}
                                </span>
                              )}
                            </div>
                          )}

                          {(currentWaterTemp !== null || currentWetsuit) && (
                            <div className="flex items-center gap-1 text-xs font-normal text-zinc-600 flex-wrap">
                              <Droplets
                                size={12}
                                strokeWidth={1.75}
                                className="text-sky-600 shrink-0"
                              />
                              {currentWaterTemp !== null && (
                                <span>Agua {Math.round(currentWaterTemp)}°</span>
                              )}
                              {currentWaterTemp !== null && currentWetsuit && (
                                <span className="text-zinc-300">·</span>
                              )}
                              {currentWetsuit && (
                                <span className="text-zinc-700 font-medium">
                                  {currentWetsuit}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 6. Valoración */}
                      <div className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                        <div className="text-[11px] font-normal text-zinc-500">Valoración</div>
                        <div>
                          {renderStars(currentRating.stars)}
                          <div className="text-xs font-normal text-zinc-600 mt-1.5">
                            {getStarsLabel(currentRating.stars)}
                          </div>
                        </div>
                      </div>

                      {/* 7. Sol */}
                      <div className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-1.5">
                        <div className="text-[11px] font-normal text-zinc-500">Sol</div>
                        <div className="space-y-1 text-xs font-normal text-zinc-700">
                          <div className="flex items-center justify-between gap-1">
                            <span className="inline-flex items-center gap-1 text-zinc-500">
                              <Sunrise size={13} strokeWidth={1.75} className="text-amber-500" />
                              Amanecer
                            </span>
                            <span className="font-medium text-zinc-900">
                              {currentPoint.sunrise ?? '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="inline-flex items-center gap-1 text-zinc-500">
                              <Sunset size={13} strokeWidth={1.75} className="text-orange-500" />
                              Atardecer
                            </span>
                            <span className="font-medium text-zinc-900">
                              {currentPoint.sunset ?? '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {groupedDays.map((group) => {
                  const dayPeaks = dailyTidePeaks[group.dateKey] ?? [];

                  return (
                    <section key={group.key} className="space-y-2">
                      <div className="px-1 flex items-baseline justify-between gap-2">
                        <h2 className="text-sm font-medium text-zinc-600 shrink-0">
                          {group.label}
                        </h2>

                        {dayPeaks.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openTideModal(group.dateKey)}
                            aria-label={`Ver gráfico de marea para ${group.label}`}
                            className="text-xs font-normal text-zinc-500 hover:text-zinc-900 tabular-nums truncate cursor-pointer transition-colors rounded-md px-1 -mr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                          >
                            {dayPeaks.map((peak, idx) => (
                              <span key={peak.time}>
                                {idx > 0 && <span className="text-zinc-300 mx-1">·</span>}
                                <span className="text-zinc-400">
                                  {peak.type === 'high' ? '▲' : '▼'}
                                </span>{' '}
                                {formatHourHHMM(peak.time)}
                              </span>
                            ))}
                          </button>
                        )}
                      </div>

                      <div className="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100 overflow-hidden">
                        {group.items.map(({ item: f, isCurrent }) => {
                          const rating = calculateSurfRating(f, selectedSpot);
                          const timeObj = new Date(f.time);
                          const hour = timeObj.getHours();
                          const isNight = f.isNight ?? (hour < 6 || hour >= 20);
                          const isExpanded = expandedTime === f.time;
                          const timeStr = formatHourHHMM(f.time);

                          const swell1 = f.primarySwell ?? {
                            height: f.waveHeight,
                            period: f.wavePeriod,
                            direction: f.waveDirection,
                          };
                          const swell1Quality = getSwellDirectionQuality(
                            swell1.direction,
                            selectedSpot.idealSwellDeg
                          );
                          const swell2 = f.secondarySwell ?? null;
                          const swell2Quality = swell2
                            ? getSwellDirectionQuality(swell2.direction, selectedSpot.idealSwellDeg)
                            : null;
                          const rowEnergy = calculateWaveEnergyKj(
                            swell1.height,
                            swell1.period,
                            swell2
                          );

                          const hasRawWave =
                            typeof f.rawWaveHeight === 'number' &&
                            Number.isFinite(f.rawWaveHeight);
                          const hasTideTrend =
                            f.tideTrend === 'rising' || f.tideTrend === 'falling';
                          const hasTideHeight =
                            typeof f.tideHeight === 'number' &&
                            Number.isFinite(f.tideHeight);
                          const hasTide = hasTideTrend || hasTideHeight;
                          const hasGusts =
                            typeof f.windGusts === 'number' &&
                            Number.isFinite(f.windGusts);
                          const hasWaterTemp =
                            typeof f.waterTemp === 'number' &&
                            Number.isFinite(f.waterTemp);
                          const hasAirTemp =
                            typeof f.airTemp === 'number' &&
                            Number.isFinite(f.airTemp);
                          const rowWeather = getWeatherLabel(f.weatherCode);
                          const rowWetsuit = getWetsuitRecommendation(f.waterTemp);

                          return (
                            <div key={f.time}>
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() =>
                                  setExpandedTime((prev) => (prev === f.time ? null : f.time))
                                }
                                className={`relative w-full text-left px-4 py-3.5 flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-zinc-50 active:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-300 ${
                                  isNight && !isExpanded ? 'opacity-60 bg-zinc-50/70' : ''
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

                                {/* Columna central: Swell 1 directo + período y dirección coloreada */}
                                <div className="flex flex-col items-center justify-center w-[36%]">
                                  <span className="text-xl font-semibold leading-tight whitespace-nowrap tabular-nums text-zinc-900">
                                    {swell1.height.toFixed(1)}
                                    <span className="text-sm font-normal text-zinc-500 ml-0.5">
                                      m
                                    </span>
                                  </span>

                                  <div className="flex items-center gap-1 text-[13px] font-normal text-zinc-600 mt-1 tabular-nums">
                                    <span>{Math.round(swell1.period)}s</span>
                                    <span className="text-zinc-300">·</span>
                                    <ArrowDown
                                      size={13}
                                      strokeWidth={2}
                                      className={getSwellQualityColor(swell1Quality)}
                                      style={{ transform: `rotate(${swell1.direction}deg)` }}
                                    />
                                    <span>{degToCompass(swell1.direction)}</span>
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
                                      {Math.round(f.windSpeed)}{' '}
                                      <span className="text-xs font-normal text-zinc-500">
                                        km/h
                                      </span>
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
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 tabular-nums">
                                    {/* Swell 2 o Mar de viento */}
                                    <div>
                                      <div className="text-xs font-normal text-zinc-500">
                                        {swell2?.isWindWave ? 'Mar de viento' : 'Swell 2'}
                                      </div>
                                      {swell2 && swell2Quality ? (
                                        <div className="flex items-center gap-1 font-medium text-zinc-900 mt-0.5 flex-wrap">
                                          <span>{swell2.height.toFixed(1)} m</span>
                                          <span className="text-zinc-400 font-normal">·</span>
                                          <span>{Math.round(swell2.period)}s</span>
                                          <span className="text-zinc-400 font-normal">·</span>
                                          <ArrowDown
                                            size={13}
                                            strokeWidth={2}
                                            className={getSwellQualityColor(swell2Quality)}
                                            style={{ transform: `rotate(${swell2.direction}deg)` }}
                                          />
                                          <span>{degToCompass(swell2.direction)}</span>
                                        </div>
                                      ) : (
                                        <div className="text-xs font-normal text-zinc-500 mt-1">
                                          Sin swell secundario
                                        </div>
                                      )}
                                    </div>

                                    {/* Energía combinada */}
                                    <div>
                                      <div className="text-xs font-normal text-zinc-500">
                                        Energía
                                      </div>
                                      <div className="font-medium text-zinc-900 mt-0.5">
                                        {rowEnergy.kj} kJ
                                        <span className="text-zinc-400 font-normal"> · </span>
                                        <span className="font-normal text-zinc-600 capitalize">
                                          {rowEnergy.label}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Marea */}
                                    {hasTide && (
                                      <div>
                                        <div className="text-xs font-normal text-zinc-500">
                                          Marea
                                        </div>
                                        <div className="font-medium text-zinc-900 mt-0.5">
                                          {hasTideTrend &&
                                            (f.tideTrend === 'rising' ? 'Subiendo' : 'Bajando')}
                                          {hasTideTrend && hasTideHeight && (
                                            <span className="text-zinc-400 font-normal"> · </span>
                                          )}
                                          {hasTideHeight && `${f.tideHeight!.toFixed(1)} m`}
                                        </div>
                                      </div>
                                    )}

                                    {/* Ráfagas */}
                                    {hasGusts && (
                                      <div>
                                        <div className="text-xs font-normal text-zinc-500">
                                          Ráfagas
                                        </div>
                                        <div className="font-medium text-zinc-900 mt-0.5">
                                          {Math.round(f.windGusts!)} km/h
                                        </div>
                                      </div>
                                    )}

                                    {/* Clima (con ícono, sin palabra "Aire") */}
                                    {(hasAirTemp || rowWeather) && (
                                      <div>
                                        <div className="text-xs font-normal text-zinc-500">
                                          Clima
                                        </div>
                                        <div className="flex items-center gap-1.5 font-medium text-zinc-900 mt-0.5 flex-wrap">
                                          <WeatherIcon
                                            code={f.weatherCode}
                                            isNight={isNight}
                                            className="w-3.5 h-3.5 shrink-0"
                                          />
                                          {hasAirTemp && <span>{Math.round(f.airTemp!)}°</span>}
                                          {hasAirTemp && rowWeather && (
                                            <span className="text-zinc-400 font-normal">·</span>
                                          )}
                                          {rowWeather && (
                                            <span className="font-normal text-zinc-600">
                                              {rowWeather}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Agua y traje */}
                                    {hasWaterTemp && (
                                      <div>
                                        <div className="text-xs font-normal text-zinc-500">
                                          Agua
                                        </div>
                                        <div className="flex items-center gap-1 font-medium text-zinc-900 mt-0.5">
                                          <Droplets
                                            size={13}
                                            strokeWidth={1.75}
                                            className="text-sky-600 shrink-0"
                                          />
                                          <span>{Math.round(f.waterTemp!)}°</span>
                                          {rowWetsuit && (
                                            <>
                                              <span className="text-zinc-400 font-normal">·</span>
                                              <span className="font-normal text-zinc-600">
                                                {rowWetsuit}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Mar total */}
                                    {hasRawWave && (
                                      <div>
                                        <div className="text-xs font-normal text-zinc-500">
                                          Mar total
                                        </div>
                                        <div className="font-medium text-zinc-900 mt-0.5">
                                          {f.rawWaveHeight!.toFixed(1)} m
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
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

      {/* Modal interactivo de mareas */}
      <TideModal
        isOpen={isTideModalOpen}
        onClose={() => setIsTideModalOpen(false)}
        spotName={selectedSpot.name}
        forecast={forecast}
        initialDate={tideModalDate}
      />

      {/* Barra de navegación inferior fija */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-t border-zinc-200 z-1100">
        <div className="max-w-2xl mx-auto h-full flex items-center justify-around px-2">
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
