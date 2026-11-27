import { useEffect, useRef, useState } from 'react';
import type { CurrentTideState, ForecastData, TidePeak } from '../services/openMeteo';
import {
  calculateSurfRating,
  calculateEffectiveEnergyInfo,
  getSwellDirectionQualityForSpot,
  type SpotConfig,
} from '../services/surfRating';
import {
  getWetsuitRecommendation,
  getWeatherLabel,
} from '../services/surfExtras';
import {
  buildShareReportText,
  degToCompass,
  formatHourHHMM,
  formatWindQualityLabel,
  getSwellQualityColor,
  getEnergySegmentColor,
  getStarsLabel,
  getWindTextColor,
  getWindDotColor,
} from '../utils/surfFormat';
import WeatherIcon from './WeatherIcon';
import {
  ArrowDown,
  Check,
  ChevronRight,
  Droplets,
  Share2,
  Star,
  Sunrise,
  Sunset,
} from 'lucide-react';

interface CurrentConditionsProps {
  spot: SpotConfig;
  currentPoint: ForecastData;
  currentTideState: CurrentTideState | null;
  nextTidePeak: TidePeak | null;
  updatedLabel: string | null;
  onOpenTideModal: (dateKey: string) => void;
}

export default function CurrentConditions({
  spot,
  currentPoint,
  currentTideState,
  nextTidePeak,
  updatedLabel,
  onOpenTideModal,
}: CurrentConditionsProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const currentRating = calculateSurfRating(currentPoint, spot);
  const currentPrimarySwell = currentPoint.primarySwell ?? {
    height: currentPoint.waveHeight,
    period: currentPoint.wavePeriod,
    direction: currentPoint.waveDirection,
  };
  const currentSecondarySwell = currentPoint.secondarySwell ?? null;
  const currentEnergy = calculateEffectiveEnergyInfo(currentPoint, spot);
  const currentWaterTemp =
    typeof currentPoint.waterTemp === 'number' && Number.isFinite(currentPoint.waterTemp)
      ? currentPoint.waterTemp
      : null;
  const currentAirTemp =
    typeof currentPoint.airTemp === 'number' && Number.isFinite(currentPoint.airTemp)
      ? currentPoint.airTemp
      : null;
  const currentWetsuit = getWetsuitRecommendation(currentWaterTemp);
  const currentWeatherLabel = getWeatherLabel(currentPoint.weatherCode);
  const currentIsNight = currentPoint.isNight ?? false;
  const currentTideHeight = currentTideState?.height ?? null;
  const currentTideTrend = currentTideState?.trend ?? null;
  const currentTimeLabel = formatHourHHMM(currentPoint.time);

  const showCopiedFeedback = () => {
    setCopied(true);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 2000);
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = buildShareReportText({
      spotName: spot.name,
      timeLabel: currentTimeLabel,
      swell1Height: currentPrimarySwell.height,
      swell1Period: currentPrimarySwell.period,
      swell1Direction: currentPrimarySwell.direction,
      windSpeed: currentPoint.windSpeed,
      windDirection: currentPoint.windDirection,
      windQuality: currentRating.windQuality,
      tideHeight: currentTideHeight,
      tideTrend: currentTideTrend,
      stars: currentRating.stars,
      url,
    });

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `SurfMDQ · ${spot.name}`,
          text,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showCopiedFeedback();
      }
    } catch {
      // Ignorar si el navegador bloquea el portapapeles
    }
  };

  return (
    <section aria-label="Condiciones actuales" className="space-y-2">
      <div className="px-1 h-7 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-600">Condiciones actuales</h2>
        <div className="relative flex items-center gap-1.5 shrink-0">
          {copied && (
            <span
              role="status"
              className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white"
            >
              Copiado
            </span>
          )}
          <span className="text-xs font-normal text-zinc-500 tabular-nums">
            {currentTimeLabel}
          </span>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Compartir parte"
            title="Compartir parte"
            className="p-1 -mr-1 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            {copied ? (
              <Check size={14} strokeWidth={2} className="text-emerald-600" />
            ) : (
              <Share2 size={14} strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 tabular-nums">
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
                    getSwellDirectionQualityForSpot(
                      currentPrimarySwell.direction,
                      currentPrimarySwell.period,
                      spot
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
                      getSwellDirectionQualityForSpot(
                        currentSecondarySwell.direction,
                        currentSecondarySwell.period,
                        spot
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
              <span className={getWindTextColor(currentRating.windQuality)}>
                {formatWindQualityLabel(currentRating.windQuality)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Marea (clickeable -> abre gráfico interactivo) */}
        <button
          type="button"
          onClick={() => onOpenTideModal(currentPoint.time.slice(0, 10))}
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

        {/* 5. Clima + Agua y Traje */}
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
                <Droplets size={12} strokeWidth={1.75} className="text-sky-600 shrink-0" />
                {currentWaterTemp !== null && (
                  <span>Agua {Math.round(currentWaterTemp)}°</span>
                )}
                {currentWaterTemp !== null && currentWetsuit && (
                  <span className="text-zinc-300">·</span>
                )}
                {currentWetsuit && (
                  <span className="text-zinc-700 font-medium">{currentWetsuit}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 6. Valoración */}
        <div className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col justify-between gap-1.5">
          <div className="text-[11px] font-normal text-zinc-500">Valoración</div>
          <div>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={14}
                  strokeWidth={1.75}
                  fill={i < currentRating.stars ? 'currentColor' : 'none'}
                  className={i < currentRating.stars ? 'text-amber-500' : 'text-zinc-300'}
                />
              ))}
            </div>
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

      {updatedLabel && (
        <p className="px-1 text-xs font-normal text-zinc-400 tabular-nums">{updatedLabel}</p>
      )}
    </section>
  );
}
