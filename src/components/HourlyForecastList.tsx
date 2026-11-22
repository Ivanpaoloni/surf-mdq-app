import type { ForecastData, TidePeak } from '../services/openMeteo';
import {
  calculateSurfRating,
  calculateWaveEnergyKj,
  type BestSessionWindow,
  type SpotConfig,
} from '../services/surfRating';
import {
  getWetsuitRecommendation,
  getSwellDirectionQuality,
  getWeatherLabel,
} from '../services/surfExtras';
import {
  degToCompass,
  formatHourHHMM,
  getSwellQualityColor,
  getWindTextColor,
  getWindDotColor,
} from '../utils/surfFormat';
import WeatherIcon from './WeatherIcon';
import { ArrowDown, Droplets, Star } from 'lucide-react';

export interface DayGroup {
  key: string;
  dateKey: string;
  label: string;
  bestWindow: BestSessionWindow | null;
  items: { item: ForecastData; isCurrent: boolean }[];
}

interface HourlyForecastListProps {
  spot: SpotConfig;
  groupedDays: DayGroup[];
  dailyTidePeaks: Record<string, TidePeak[]>;
  expandedTime: string | null;
  onToggleExpand: (time: string) => void;
  onFocusHour: (time: string) => void;
  onOpenTideModal: (dateKey: string) => void;
}

export default function HourlyForecastList({
  spot,
  groupedDays,
  dailyTidePeaks,
  expandedTime,
  onToggleExpand,
  onFocusHour,
  onOpenTideModal,
}: HourlyForecastListProps) {
  const handleSelectBestWindow = (group: DayGroup) => {
    if (!group.bestWindow || group.items.length === 0) return;
    const targetMs = new Date(group.bestWindow.startTime).getTime();
    const closest = group.items.reduce((best, entry) => {
      const diffEntry = Math.abs(new Date(entry.item.time).getTime() - targetMs);
      const diffBest = Math.abs(new Date(best.item.time).getTime() - targetMs);
      return diffEntry < diffBest ? entry : best;
    }, group.items[0]);

    onFocusHour(closest.item.time);
    const el = document.getElementById(`forecast-row-${closest.item.time}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      {groupedDays.map((group) => {
        const dayPeaks = dailyTidePeaks[group.dateKey] ?? [];
        const bw = group.bestWindow;

        return (
          <section key={group.key} className="space-y-2">
            <div className="px-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium text-zinc-600 shrink-0">{group.label}</h2>

                {dayPeaks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenTideModal(group.dateKey)}
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

              {bw && (
                <button
                  type="button"
                  onClick={() => handleSelectBestWindow(group)}
                  className="inline-flex items-center gap-1.5 max-w-full text-xs font-normal text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-full px-2.5 py-1 transition-colors cursor-pointer tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                >
                  <Star
                    size={11}
                    strokeWidth={1.75}
                    fill="currentColor"
                    className="text-amber-500 shrink-0"
                  />
                  <span className="truncate">
                    <span className="text-zinc-500">Mejor ventana:</span>{' '}
                    <span className="font-medium text-zinc-900">
                      {bw.hourCount > 1
                        ? `${formatHourHHMM(bw.startTime)}–${formatHourHHMM(bw.endTime)}`
                        : formatHourHHMM(bw.startTime)}
                    </span>
                    <span className="text-zinc-300 mx-1">·</span>
                    <span className="font-medium text-zinc-900">{bw.stars}★</span>
                    {bw.windQuality && (
                      <span className={`ml-1 capitalize ${getWindTextColor(bw.windQuality)}`}>
                        {bw.windQuality}
                      </span>
                    )}
                  </span>
                </button>
              )}
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100 overflow-hidden">
              {group.items.map(({ item: f, isCurrent }) => {
                const rating = calculateSurfRating(f, spot);
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
                  spot.idealSwellDeg
                );
                const swell2 = f.secondarySwell ?? null;
                const swell2Quality = swell2
                  ? getSwellDirectionQuality(swell2.direction, spot.idealSwellDeg)
                  : null;
                const rowEnergy = calculateWaveEnergyKj(swell1.height, swell1.period, swell2);

                const hasRawWave =
                  typeof f.rawWaveHeight === 'number' && Number.isFinite(f.rawWaveHeight);
                const hasTideTrend = f.tideTrend === 'rising' || f.tideTrend === 'falling';
                const hasTideHeight =
                  typeof f.tideHeight === 'number' && Number.isFinite(f.tideHeight);
                const hasTide = hasTideTrend || hasTideHeight;
                const hasGusts =
                  typeof f.windGusts === 'number' && Number.isFinite(f.windGusts);
                const hasWaterTemp =
                  typeof f.waterTemp === 'number' && Number.isFinite(f.waterTemp);
                const hasAirTemp =
                  typeof f.airTemp === 'number' && Number.isFinite(f.airTemp);
                const rowWeather = getWeatherLabel(f.weatherCode);
                const rowWetsuit = getWetsuitRecommendation(f.waterTemp);

                return (
                  <div key={f.time} id={`forecast-row-${f.time}`}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => onToggleExpand(f.time)}
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
                            <span className="text-xs font-medium text-sky-700">Ahora</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={14}
                              strokeWidth={1.75}
                              fill={i < rating.stars ? 'currentColor' : 'none'}
                              className={i < rating.stars ? 'text-amber-500' : 'text-zinc-300'}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Columna central: Swell 1 directo + período y dirección coloreada */}
                      <div className="flex flex-col items-center justify-center w-[36%]">
                        <span className="text-xl font-semibold leading-tight whitespace-nowrap tabular-nums text-zinc-900">
                          {swell1.height.toFixed(1)}
                          <span className="text-sm font-normal text-zinc-500 ml-0.5">m</span>
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
                            <div className="text-xs font-normal text-zinc-500">Energía</div>
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
                              <div className="text-xs font-normal text-zinc-500">Marea</div>
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
                              <div className="text-xs font-normal text-zinc-500">Ráfagas</div>
                              <div className="font-medium text-zinc-900 mt-0.5">
                                {Math.round(f.windGusts!)} km/h
                              </div>
                            </div>
                          )}

                          {/* Clima */}
                          {(hasAirTemp || rowWeather) && (
                            <div>
                              <div className="text-xs font-normal text-zinc-500">Clima</div>
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
                              <div className="text-xs font-normal text-zinc-500">Agua</div>
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
    </>
  );
}
