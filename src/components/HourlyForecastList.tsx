import type { ForecastData, TidePeak } from '../services/openMeteo';
import {
  calculateSurfRating,
  calculateEffectiveEnergyInfo,
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
  items: { item: ForecastData }[];
}

interface HourlyForecastListProps {
  spot: SpotConfig;
  groupedDays: DayGroup[];
  dailyTidePeaks: Record<string, TidePeak[]>;
  currentHourTime: string | null;
  stepHours: number;
  todayKey: string;
  expandedTime: string | null;
  onToggleExpand: (time: string) => void;
  onFocusHour: (time: string) => void;
  onOpenTideModal: (dateKey: string) => void;
}

export default function HourlyForecastList({
  spot,
  groupedDays,
  dailyTidePeaks,
  currentHourTime,
  stepHours,
  todayKey,
  expandedTime,
  onToggleExpand,
  onFocusHour,
  onOpenTideModal,
}: HourlyForecastListProps) {
  // Determinar la única fila que representa "Ahora" según el intervalo activo (siempre dentro de Hoy)
  let currentRowTime: string | null = null;
  if (currentHourTime) {
    const currentHourMs = new Date(currentHourTime).getTime();
    const todayGroup = groupedDays.find((g) => g.dateKey === todayKey);

    if (todayGroup && Number.isFinite(currentHourMs)) {
      if (stepHours === 1) {
        const exact = todayGroup.items.find((entry) => entry.item.time === currentHourTime);
        currentRowTime = exact ? exact.item.time : null;
      } else {
        for (const entry of todayGroup.items) {
          const itemMs = new Date(entry.item.time).getTime();
          if (Number.isFinite(itemMs) && itemMs <= currentHourMs) {
            currentRowTime = entry.item.time;
          }
        }
      }
    }
  }
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
          <section
            key={group.key}
            id={`forecast-day-${group.dateKey}`}
            className="space-y-2 scroll-mt-28 lg:scroll-mt-20"
          >
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
              {/* Encabezado tabular en desktop (6 columnas compartidas con las filas) */}
              <div className="hidden lg:grid lg:grid-cols-[minmax(88px,1.05fr)_minmax(96px,1.15fr)_minmax(92px,1.1fr)_minmax(130px,1.45fr)_minmax(66px,0.75fr)_minmax(72px,0.8fr)] lg:items-center lg:gap-3 px-4 py-2 bg-zinc-50/70 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                <span>Hora</span>
                <span>Swell 1</span>
                <span>Swell 2</span>
                <span>Viento</span>
                <span className="text-right">Marea</span>
                <span className="text-right">Energía</span>
              </div>

              {group.items.map(({ item: f }) => {
                const isCurrent = currentRowTime !== null && f.time === currentRowTime;
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
                const rowEnergy = calculateEffectiveEnergyInfo(f, spot);

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
                const hasDesktopExtras = hasRawWave || hasAirTemp || Boolean(rowWeather) || hasWaterTemp;

                return (
                  <div key={f.time} id={`forecast-row-${f.time}`}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => onToggleExpand(f.time)}
                      className={`relative w-full text-left px-4 py-3.5 lg:py-2.5 cursor-pointer transition-colors hover:bg-zinc-50 active:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-300 ${
                        isNight && !isExpanded ? 'opacity-60 bg-zinc-50/70' : ''
                      }`}
                    >
                      {isCurrent && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-3 bottom-3 lg:top-2 lg:bottom-2 w-1 rounded-r bg-sky-700"
                        />
                      )}

                      {/* Vista mobile / tablet (< lg): 3 columnas exactas */}
                      <div className="flex items-center justify-between gap-2 lg:hidden">
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
                      </div>

                      {/* Vista desktop (lg+): tabla densa de 6 columnas alineadas */}
                      <div className="hidden lg:grid lg:grid-cols-[minmax(88px,1.05fr)_minmax(96px,1.15fr)_minmax(92px,1.1fr)_minmax(130px,1.45fr)_minmax(66px,0.75fr)_minmax(72px,0.8fr)] lg:items-center lg:gap-3 tabular-nums">
                        {/* 1. Hora + estrellas */}
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-medium text-zinc-900 leading-none">
                              {timeStr}
                            </span>
                            {isCurrent && (
                              <span className="text-[11px] font-medium text-sky-700 leading-none">
                                Ahora
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                strokeWidth={1.75}
                                fill={i < rating.stars ? 'currentColor' : 'none'}
                                className={i < rating.stars ? 'text-amber-500' : 'text-zinc-300'}
                              />
                            ))}
                          </div>
                        </div>

                        {/* 2. Swell 1 */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm font-semibold text-zinc-900 leading-tight whitespace-nowrap">
                            {swell1.height.toFixed(1)}{' '}
                            <span className="text-xs font-normal text-zinc-500">m</span>
                          </span>
                          <div className="flex items-center gap-1 text-xs font-normal text-zinc-600 leading-tight">
                            <span>{Math.round(swell1.period)}s</span>
                            <span className="text-zinc-300">·</span>
                            <ArrowDown
                              size={12}
                              strokeWidth={2}
                              className={`shrink-0 ${getSwellQualityColor(swell1Quality)}`}
                              style={{ transform: `rotate(${swell1.direction}deg)` }}
                            />
                            <span>{degToCompass(swell1.direction)}</span>
                          </div>
                        </div>

                        {/* 3. Swell 2 */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {swell2 && swell2Quality ? (
                            <>
                              <span className="text-sm font-medium text-zinc-800 leading-tight whitespace-nowrap">
                                {swell2.height.toFixed(1)}{' '}
                                <span className="text-xs font-normal text-zinc-500">m</span>
                              </span>
                              <div className="flex items-center gap-1 text-xs font-normal text-zinc-500 leading-tight">
                                <span>{Math.round(swell2.period)}s</span>
                                <span className="text-zinc-300">·</span>
                                <ArrowDown
                                  size={12}
                                  strokeWidth={2}
                                  className={`shrink-0 ${getSwellQualityColor(swell2Quality)}`}
                                  style={{ transform: `rotate(${swell2.direction}deg)` }}
                                />
                                <span>{degToCompass(swell2.direction)}</span>
                              </div>
                            </>
                          ) : (
                            <span className="text-sm font-normal text-zinc-300">—</span>
                          )}
                        </div>

                        {/* 4. Viento + ráfagas */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-baseline gap-1.5 flex-wrap leading-tight">
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 whitespace-nowrap">
                              <span
                                aria-hidden="true"
                                className={`h-2 w-2 rounded-full shrink-0 ${getWindDotColor(rating.windQuality)}`}
                              />
                              <span>
                                {Math.round(f.windSpeed)}{' '}
                                <span className="text-xs font-normal text-zinc-500">km/h</span>
                              </span>
                            </span>
                            {hasGusts && (
                              <span className="text-[11px] font-normal text-zinc-400 whitespace-nowrap">
                                Ráf. {Math.round(f.windGusts!)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-normal leading-tight">
                            <ArrowDown
                              size={12}
                              strokeWidth={1.75}
                              className={`shrink-0 ${getWindTextColor(rating.windQuality)}`}
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

                        {/* 5. Marea */}
                        <div className="text-right min-w-0">
                          {hasTide ? (
                            <span className="text-sm font-medium text-zinc-900 whitespace-nowrap">
                              {hasTideHeight ? (
                                <>
                                  {f.tideHeight!.toFixed(1)}{' '}
                                  <span className="text-xs font-normal text-zinc-500">m</span>
                                </>
                              ) : (
                                '—'
                              )}
                              {hasTideTrend && (
                                <span
                                  aria-label={f.tideTrend === 'rising' ? 'Subiendo' : 'Bajando'}
                                  className="ml-1 text-sky-700"
                                >
                                  {f.tideTrend === 'rising' ? '↑' : '↓'}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-sm font-normal text-zinc-300">—</span>
                          )}
                        </div>

                        {/* 6. Energía */}
                        <div className="flex flex-col items-end gap-0.5 min-w-0">
                          <span className="text-sm font-medium text-zinc-900 leading-tight whitespace-nowrap">
                            {rowEnergy.kj}{' '}
                            <span className="text-xs font-normal text-zinc-500">kJ</span>
                          </span>
                          <span className="text-[11px] font-normal text-zinc-500 capitalize leading-tight">
                            {rowEnergy.label}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Detalle técnico desplegable */}
                    {isExpanded && (
                      <div className="bg-zinc-50 border-t border-zinc-100 px-4 py-3 lg:py-2.5 text-sm text-zinc-700">
                        {/* Mobile / Tablet (< lg): detalle completo en 2 columnas */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 tabular-nums lg:hidden">
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

                        {/* Desktop (lg+): solo datos complementarios que no están en las 6 columnas */}
                        <div className="hidden lg:flex items-center flex-wrap gap-x-6 gap-y-2 text-xs tabular-nums">
                          {hasRawWave && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-500">Mar total:</span>
                              <span className="font-medium text-zinc-900">
                                {f.rawWaveHeight!.toFixed(1)} m
                              </span>
                            </div>
                          )}

                          {(hasAirTemp || rowWeather) && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-500">Clima:</span>
                              <WeatherIcon
                                code={f.weatherCode}
                                isNight={isNight}
                                className="w-3.5 h-3.5 shrink-0"
                              />
                              {hasAirTemp && (
                                <span className="font-medium text-zinc-900">
                                  {Math.round(f.airTemp!)}°
                                </span>
                              )}
                              {hasAirTemp && rowWeather && (
                                <span className="text-zinc-300">·</span>
                              )}
                              {rowWeather && (
                                <span className="text-zinc-700">{rowWeather}</span>
                              )}
                            </div>
                          )}

                          {hasWaterTemp && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-500">Agua:</span>
                              <Droplets
                                size={12}
                                strokeWidth={1.75}
                                className="text-sky-600 shrink-0"
                              />
                              <span className="font-medium text-zinc-900">
                                {Math.round(f.waterTemp!)}°
                              </span>
                              {rowWetsuit && (
                                <>
                                  <span className="text-zinc-300">·</span>
                                  <span className="text-zinc-700">{rowWetsuit}</span>
                                </>
                              )}
                            </div>
                          )}

                          {!hasDesktopExtras && (
                            <span className="text-zinc-400">
                              Sin datos adicionales para este horario.
                            </span>
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
