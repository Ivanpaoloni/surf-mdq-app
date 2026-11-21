import { useEffect, useState } from 'react';
import { getDailyTidePeaks, type ForecastData, type TidePeak } from '../services/openMeteo';
import { X, Sunrise, Sunset } from 'lucide-react';

interface TideModalProps {
  isOpen: boolean;
  onClose: () => void;
  spotName: string;
  forecast: ForecastData[];
  initialDate?: string;
}

interface ChartPoint {
  x: number;
  y: number;
  hour: number;
  height: number;
  item?: ForecastData;
}

function getLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseClockToHours(hhmm: string | null | undefined, fallback: number): number {
  if (!hhmm || !hhmm.includes(':')) return fallback;
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return Math.max(0, Math.min(24, h + m / 60));
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

function formatDayPillLabel(dateKey: string, todayKey: string, tomorrowKey: string): string {
  if (dateKey === todayKey) return 'Hoy';
  if (dateKey === tomorrowKey) return 'Mañana';

  const dateObj = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(dateObj.getTime())) return dateKey;

  const weekday = dateObj
    .toLocaleDateString('es-AR', { weekday: 'short' })
    .replace('.', '');
  const dayNum = dateObj.getDate();
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dayNum}`;
}

function getNextDateKey(dateKey: string): string {
  const dateObj = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(dateObj.getTime())) return '';
  dateObj.setDate(dateObj.getDate() + 1);
  return getLocalDateKey(dateObj);
}

function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function TideModal({
  isOpen,
  onClose,
  spotName,
  forecast,
  initialDate,
}: TideModalProps) {
  const [now] = useState<Date>(() => new Date());
  const [dateSelection, setDateSelection] = useState<{
    base?: string;
    date: string;
  } | null>(null);
  const [activeSelection, setActiveSelection] = useState<{
    date: string;
    time: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const todayKey = getLocalDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrowKey = getLocalDateKey(tomorrowDate);

  // Días disponibles que tienen al menos un valor válido de marea
  const availableDates: string[] = [];
  const validTideHeights: number[] = [];
  for (const item of forecast) {
    if (typeof item.tideHeight === 'number' && Number.isFinite(item.tideHeight)) {
      validTideHeights.push(item.tideHeight);
      const key = item.time.slice(0, 10);
      if (availableDates[availableDates.length - 1] !== key) {
        availableDates.push(key);
      }
    }
  }

  const defaultDate =
    initialDate && availableDates.includes(initialDate)
      ? initialDate
      : (availableDates[0] ?? '');

  const selectedDate =
    dateSelection &&
    dateSelection.base === initialDate &&
    availableDates.includes(dateSelection.date)
      ? dateSelection.date
      : defaultDate;

  const activeTime =
    activeSelection && activeSelection.date === selectedDate
      ? activeSelection.time
      : null;

  const dailyPeaksMap = getDailyTidePeaks(forecast);
  const dayPeaks: TidePeak[] = selectedDate ? (dailyPeaksMap[selectedDate] ?? []) : [];

  // Puntos horarios del día seleccionado con marea válida
  const dayItems = forecast.filter(
    (f): f is ForecastData & { tideHeight: number } =>
      f.time.slice(0, 10) === selectedDate &&
      typeof f.tideHeight === 'number' &&
      Number.isFinite(f.tideHeight)
  );

  // Ancla opcional a las 24:00 (00:00 del día siguiente) para extender la curva hasta el borde derecho
  const nextDateKey = selectedDate ? getNextDateKey(selectedDate) : '';
  const nextMidnightItem = nextDateKey
    ? forecast.find(
        (f): f is ForecastData & { tideHeight: number } =>
          f.time.startsWith(`${nextDateKey}T00:00`) &&
          typeof f.tideHeight === 'number' &&
          Number.isFinite(f.tideHeight)
      )
    : undefined;

  const sampleWithSun = dayItems.find((f) => f.sunrise || f.sunset);
  const sunriseStr = sampleWithSun?.sunrise ?? null;
  const sunsetStr = sampleWithSun?.sunset ?? null;
  const sunriseHour = parseClockToHours(sunriseStr, 6);
  const sunsetHour = parseClockToHours(sunsetStr, 20);

  // Dimensiones y escalas del gráfico SVG
  const width = 360;
  const height = 212;
  const padLeft = 14;
  const padRight = 14;
  const padTop = 34;
  const padBottom = 46;
  const plotWidth = width - padLeft - padRight;
  const plotTop = padTop;
  const plotBottom = height - padBottom;
  const plotHeight = plotBottom - plotTop;

  const minHeightVal = validTideHeights.length > 0 ? Math.min(...validTideHeights) : 0;
  const maxHeightVal = validTideHeights.length > 0 ? Math.max(...validTideHeights) : 1.5;
  const span = Math.max(0.4, maxHeightVal - minHeightVal);
  const yMin = minHeightVal - span * 0.16;
  const yMax = maxHeightVal + span * 0.16;

  const xForHour = (h: number) => padLeft + (Math.max(0, Math.min(24, h)) / 24) * plotWidth;
  const yForHeight = (hVal: number) =>
    plotBottom - ((hVal - yMin) / (yMax - yMin)) * plotHeight;

  const chartPoints: ChartPoint[] = dayItems.map((item) => {
    const h = parseClockToHours(item.time.slice(11, 16), 0);
    return {
      x: xForHour(h),
      y: yForHeight(item.tideHeight),
      hour: h,
      height: item.tideHeight,
      item,
    };
  });

  const curvePoints: ChartPoint[] = nextMidnightItem
    ? [
        ...chartPoints,
        {
          x: xForHour(24),
          y: yForHeight(nextMidnightItem.tideHeight),
          hour: 24,
          height: nextMidnightItem.tideHeight,
        },
      ]
    : chartPoints;

  const linePath = buildSmoothPath(curvePoints);
  const areaPath =
    curvePoints.length >= 2
      ? `${linePath} L ${curvePoints[curvePoints.length - 1].x.toFixed(1)} ${plotBottom.toFixed(1)} L ${curvePoints[0].x.toFixed(1)} ${plotBottom.toFixed(1)} Z`
      : '';

  // Indicador "Ahora" si el día seleccionado es Hoy
  const isTodaySelected = selectedDate === todayKey;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  let nowPoint: { x: number; y: number; height: number; trend: 'rising' | 'falling' | null } | null =
    null;

  if (isTodaySelected && curvePoints.length > 0) {
    const first = curvePoints[0];
    const last = curvePoints[curvePoints.length - 1];
    if (nowHour >= first.hour - 0.5 && nowHour <= last.hour + 0.5) {
      let interpolatedHeight = first.height;
      let trend: 'rising' | 'falling' | null = first.item?.tideTrend ?? null;
      let foundSegment = false;

      for (let i = 0; i < curvePoints.length - 1; i++) {
        const a = curvePoints[i];
        const b = curvePoints[i + 1];
        if (nowHour >= a.hour && nowHour <= b.hour) {
          const ratio = b.hour > a.hour ? (nowHour - a.hour) / (b.hour - a.hour) : 0;
          interpolatedHeight = a.height + (b.height - a.height) * ratio;
          trend =
            b.height > a.height
              ? 'rising'
              : b.height < a.height
                ? 'falling'
                : (a.item?.tideTrend ?? null);
          foundSegment = true;
          break;
        }
      }

      if (!foundSegment) {
        const closest = chartPoints.reduce((best, pt) =>
          Math.abs(pt.hour - nowHour) < Math.abs(best.hour - nowHour) ? pt : best
        );
        interpolatedHeight = closest.height;
        trend = closest.item?.tideTrend ?? null;
      }

      nowPoint = {
        x: xForHour(nowHour),
        y: yForHeight(interpolatedHeight),
        height: interpolatedHeight,
        trend,
      };
    }
  }

  // Punto activo por hover/tap
  const activePoint = activeTime
    ? (chartPoints.find((pt) => pt.item?.time === activeTime) ?? null)
    : null;

  const fallbackPoint =
    dayItems.length > 0
      ? isTodaySelected
        ? dayItems.reduce((best, item) => {
            const hBest = parseClockToHours(best.time.slice(11, 16), 0);
            const hItem = parseClockToHours(item.time.slice(11, 16), 0);
            return Math.abs(hItem - nowHour) < Math.abs(hBest - nowHour) ? item : best;
          })
        : dayItems[0]
      : null;

  const readoutTime = activePoint?.item
    ? formatHourHHMM(activePoint.item.time)
    : isTodaySelected && nowPoint
      ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      : fallbackPoint
        ? formatHourHHMM(fallbackPoint.time)
        : null;

  const readoutHeight = activePoint
    ? activePoint.height
    : isTodaySelected && nowPoint
      ? nowPoint.height
      : (fallbackPoint?.tideHeight ?? null);

  const readoutTrend = activePoint?.item
    ? (activePoint.item.tideTrend ?? null)
    : isTodaySelected && nowPoint
      ? nowPoint.trend
      : (fallbackPoint?.tideTrend ?? null);

  const isShowingNow = !activePoint && isTodaySelected && nowPoint !== null;

  const xTicks = [0, 6, 12, 18, 24];
  const sunriseX = xForHour(sunriseHour);
  const sunsetX = xForHour(sunsetHour);
  const midY = (plotTop + plotBottom) / 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Marea en ${spotName}`}
      onClick={onClose}
      className="fixed inset-0 z-1200 flex items-end sm:items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white border-t sm:border border-zinc-200 rounded-t-2xl sm:rounded-2xl sm:shadow-xl max-h-[85vh] overflow-y-auto px-4 pt-3 pb-5"
      >
        {/* Barra de arrastre visual (mobile) */}
        <div className="w-9 h-1 rounded-full bg-zinc-200 mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-zinc-900 truncate">
            Marea <span className="text-zinc-300 mx-1">·</span> {spotName}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar gráfico de marea"
            className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Selector de día */}
        {availableDates.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-3 pb-0.5">
            {availableDates.map((dateKey) => {
              const isSelected = dateKey === selectedDate;
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => {
                    setDateSelection({ base: initialDate, date: dateKey });
                    setActiveSelection(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
                    isSelected
                      ? 'bg-zinc-900 text-white font-medium'
                      : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 font-normal'
                  }`}
                >
                  {formatDayPillLabel(dateKey, todayKey, tomorrowKey)}
                </button>
              );
            })}
          </div>
        )}

        {dayItems.length === 0 ? (
          <div className="py-12 text-center text-sm font-normal text-zinc-500">
            No hay datos de marea disponibles para este día.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Franja fija de lectura interactiva */}
            <div className="flex items-center justify-between gap-2 bg-zinc-50 border border-zinc-200/80 rounded-xl px-3 py-2 text-sm tabular-nums">
              <div className="flex items-center gap-1.5 min-w-0">
                {readoutTime && (
                  <span className="font-medium text-zinc-900">{readoutTime}</span>
                )}
                {isShowingNow && (
                  <span className="text-xs font-medium text-sky-700">Ahora</span>
                )}
                {readoutHeight !== null && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span className="font-semibold text-zinc-900">
                      {readoutHeight.toFixed(1)}{' '}
                      <span className="text-xs font-normal text-zinc-500">m</span>
                    </span>
                  </>
                )}
                {readoutTrend && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span className="text-xs font-normal text-zinc-600">
                      {readoutTrend === 'rising' ? 'Subiendo' : 'Bajando'}
                    </span>
                  </>
                )}
              </div>

              {(sunriseStr || sunsetStr) && (
                <div className="hidden xs:flex sm:flex items-center gap-2 text-[11px] font-normal text-zinc-500 shrink-0">
                  {sunriseStr && (
                    <span className="inline-flex items-center gap-1">
                      <Sunrise size={12} strokeWidth={1.75} className="text-amber-500" />
                      {sunriseStr}
                    </span>
                  )}
                  {sunsetStr && (
                    <span className="inline-flex items-center gap-1">
                      <Sunset size={12} strokeWidth={1.75} className="text-orange-500" />
                      {sunsetStr}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Gráfico SVG puro */}
            <div className="bg-white border border-zinc-200/80 rounded-xl p-2">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto select-none block"
                onMouseLeave={() => setActiveSelection(null)}
                role="img"
                aria-label="Curva horaria de marea"
              >
                <defs>
                  <linearGradient id="tideAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Bandas nocturnas (antes del amanecer y después del atardecer) */}
                <rect
                  x={padLeft}
                  y={plotTop}
                  width={Math.max(0, sunriseX - padLeft)}
                  height={plotHeight}
                  fill="#f4f4f5"
                  rx={3}
                />
                <rect
                  x={sunsetX}
                  y={plotTop}
                  width={Math.max(0, padLeft + plotWidth - sunsetX)}
                  height={plotHeight}
                  fill="#f4f4f5"
                  rx={3}
                />

                {/* Líneas guía discretas */}
                <line
                  x1={padLeft}
                  y1={midY}
                  x2={padLeft + plotWidth}
                  y2={midY}
                  stroke="#e4e4e7"
                  strokeWidth={0.75}
                  strokeDasharray="2 3"
                />
                <line
                  x1={padLeft}
                  y1={plotBottom}
                  x2={padLeft + plotWidth}
                  y2={plotBottom}
                  stroke="#e4e4e7"
                  strokeWidth={1}
                />

                {/* Área degradada y curva suave */}
                {areaPath && <path d={areaPath} fill="url(#tideAreaGrad)" />}
                {linePath && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Línea y punto de hora actual ("Ahora") */}
                {nowPoint && (
                  <g>
                    <line
                      x1={nowPoint.x}
                      y1={plotTop}
                      x2={nowPoint.x}
                      y2={plotBottom}
                      stroke="#0284c7"
                      strokeOpacity={0.45}
                      strokeWidth={1.25}
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={nowPoint.x}
                      cy={nowPoint.y}
                      r={4.5}
                      fill="#0284c7"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  </g>
                )}

                {/* Picos de Pleamar y Bajamar sobre la curva */}
                {dayPeaks.map((peak) => {
                  const h = parseClockToHours(peak.time.slice(11, 16), 0);
                  const px = xForHour(h);
                  const py = yForHeight(peak.height);
                  const labelX = Math.max(padLeft + 20, Math.min(padLeft + plotWidth - 20, px));
                  const isHigh = peak.type === 'high';
                  const timeY = isHigh ? Math.max(11, py - 18) : Math.min(plotBottom + 12, py + 14);
                  const heightY = isHigh ? Math.max(22, py - 7) : Math.min(plotBottom + 23, py + 25);

                  return (
                    <g key={peak.time}>
                      <circle
                        cx={px}
                        cy={py}
                        r={3.5}
                        fill="#ffffff"
                        stroke="#0284c7"
                        strokeWidth={2}
                      />
                      <text
                        x={labelX}
                        y={timeY}
                        textAnchor="middle"
                        className="text-[10px] fill-zinc-500 tabular-nums"
                      >
                        {formatHourHHMM(peak.time)}
                      </text>
                      <text
                        x={labelX}
                        y={heightY}
                        textAnchor="middle"
                        className="text-[10px] font-medium fill-zinc-800 tabular-nums"
                      >
                        {peak.height.toFixed(1)} m
                      </text>
                    </g>
                  );
                })}

                {/* Indicador interactivo activo (hover / tap) */}
                {activePoint && (
                  <g>
                    <line
                      x1={activePoint.x}
                      y1={plotTop}
                      x2={activePoint.x}
                      y2={plotBottom}
                      stroke="#71717a"
                      strokeOpacity={0.5}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r={4.5}
                      fill="#18181b"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  </g>
                )}

                {/* Eje X: 00h, 06h, 12h, 18h, 24h */}
                {xTicks.map((tick) => {
                  const tx = xForHour(tick);
                  const anchor = tick === 0 ? 'start' : tick === 24 ? 'end' : 'middle';
                  return (
                    <text
                      key={tick}
                      x={tx}
                      y={height - 6}
                      textAnchor={anchor}
                      className="text-[11px] fill-zinc-400 tabular-nums"
                    >
                      {String(tick).padStart(2, '0')}h
                    </text>
                  );
                })}

                {/* Columnas invisibles interactivas por cada hora */}
                {chartPoints.map((pt, idx) => {
                  if (!pt.item) return null;
                  const prevX = idx > 0 ? (chartPoints[idx - 1].x + pt.x) / 2 : padLeft;
                  const nextX =
                    idx < chartPoints.length - 1
                      ? (pt.x + chartPoints[idx + 1].x) / 2
                      : padLeft + plotWidth;
                  const colW = Math.max(8, nextX - prevX);
                  const pointTime = pt.item.time;

                  return (
                    <rect
                      key={pointTime}
                      x={prevX}
                      y={plotTop}
                      width={colW}
                      height={plotHeight}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() =>
                        setActiveSelection({ date: selectedDate, time: pointTime })
                      }
                      onClick={() =>
                        setActiveSelection((prev) =>
                          prev && prev.time === pointTime
                            ? null
                            : { date: selectedDate, time: pointTime }
                        )
                      }
                      onTouchStart={() =>
                        setActiveSelection({ date: selectedDate, time: pointTime })
                      }
                    />
                  );
                })}
              </svg>
            </div>

            {/* Resumen de Pleamares y Bajamares debajo del gráfico */}
            <div className="space-y-2">
              <div className="text-xs font-normal text-zinc-500 px-0.5">
                Pleamares y bajamares
              </div>

              {dayPeaks.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 tabular-nums">
                  {dayPeaks.map((peak) => {
                    const isHigh = peak.type === 'high';
                    return (
                      <div
                        key={peak.time}
                        className="flex items-center justify-between gap-2 bg-zinc-50 border border-zinc-200/80 rounded-xl px-3 py-2.5"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[11px] ${
                              isHigh ? 'text-sky-700' : 'text-zinc-400'
                            }`}
                          >
                            {isHigh ? '▲' : '▼'}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-normal text-zinc-500">
                              {isHigh ? 'Pleamar' : 'Bajamar'}
                            </div>
                            <div className="text-sm font-medium text-zinc-900">
                              {formatHourHHMM(peak.time)}
                            </div>
                          </div>
                        </div>

                        <span className="text-sm font-semibold text-zinc-900 shrink-0">
                          {peak.height.toFixed(1)}{' '}
                          <span className="text-xs font-normal text-zinc-500">m</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-normal text-zinc-500 px-0.5">
                  Sin pleamar ni bajamar detectada en las horas restantes de este día.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
