import { useId } from 'react';
import {
  getCurrentTideState,
  type ForecastData,
  type TidePeak,
} from '../services/openMeteo';
import { formatHourHHMM, parseClockToHours } from '../utils/surfFormat';

export interface TideCurveChartProps {
  forecast: ForecastData[];
  dateKey: string;
  dayPeaks: TidePeak[];
  nowMs: number;
  compact?: boolean;
  activeTime?: string | null;
  onSelectTime?: (time: string | null) => void;
  onToggleTime?: (time: string) => void;
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

export default function TideCurveChart({
  forecast,
  dateKey,
  dayPeaks,
  nowMs,
  compact = false,
  activeTime = null,
  onSelectTime,
  onToggleTime,
}: TideCurveChartProps) {
  const gradientId = useId();

  const validTideHeights: number[] = [];
  for (const item of forecast) {
    if (typeof item.tideHeight === 'number' && Number.isFinite(item.tideHeight)) {
      validTideHeights.push(item.tideHeight);
    }
  }

  const dayItems = forecast.filter(
    (f): f is ForecastData & { tideHeight: number } =>
      f.time.slice(0, 10) === dateKey &&
      typeof f.tideHeight === 'number' &&
      Number.isFinite(f.tideHeight)
  );

  if (dayItems.length === 0) return null;

  const nextDateKey = dateKey ? getNextDateKey(dateKey) : '';
  const nextMidnightItem = nextDateKey
    ? forecast.find(
        (f): f is ForecastData & { tideHeight: number } =>
          f.time.startsWith(`${nextDateKey}T00:00`) &&
          typeof f.tideHeight === 'number' &&
          Number.isFinite(f.tideHeight)
      )
    : undefined;

  const sampleWithSun = dayItems.find((f) => f.sunrise || f.sunset);
  const sunriseHour = parseClockToHours(sampleWithSun?.sunrise, 6);
  const sunsetHour = parseClockToHours(sampleWithSun?.sunset, 20);

  const width = 360;
  const height = compact ? 124 : 212;
  const padLeft = compact ? 10 : 14;
  const padRight = compact ? 10 : 14;
  const padTop = compact ? 22 : 34;
  const padBottom = compact ? 26 : 46;
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

  const now = new Date(nowMs);
  const todayKey = getLocalDateKey(now);
  const isTodaySelected = dateKey === todayKey;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const sharedCurrentTide = isTodaySelected ? getCurrentTideState(forecast, nowMs) : null;
  const nowPoint =
    isTodaySelected && sharedCurrentTide && curvePoints.length > 0
      ? {
          x: xForHour(nowHour),
          y: yForHeight(sharedCurrentTide.height),
        }
      : null;

  const activePoint =
    !compact && activeTime
      ? (chartPoints.find((pt) => pt.item?.time === activeTime) ?? null)
      : null;

  const xTicks = [0, 6, 12, 18, 24];
  const sunriseX = xForHour(sunriseHour);
  const sunsetX = xForHour(sunsetHour);
  const midY = (plotTop + plotBottom) / 2;
  const interactive = !compact && Boolean(onSelectTime || onToggleTime);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto select-none block"
      onMouseLeave={interactive ? () => onSelectTime?.(null) : undefined}
      role="img"
      aria-label="Curva horaria de marea"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="#0284c7"
          strokeWidth={compact ? 2 : 2.5}
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
            r={compact ? 3.5 : 4.5}
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
        const labelX = Math.max(padLeft + 18, Math.min(padLeft + plotWidth - 18, px));
        const isHigh = peak.type === 'high';

        if (compact) {
          const compactLabelY = isHigh
            ? Math.max(10, py - 8)
            : Math.min(plotBottom - 3, py + 12);
          return (
            <g key={peak.time}>
              <circle
                cx={px}
                cy={py}
                r={2.75}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.75}
              />
              <text
                x={labelX}
                y={compactLabelY}
                textAnchor="middle"
                className="text-[9.5px] font-medium fill-zinc-600 tabular-nums"
              >
                {formatHourHHMM(peak.time)}
              </text>
            </g>
          );
        }

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
            className={`${compact ? 'text-[10px]' : 'text-[11px]'} fill-zinc-400 tabular-nums`}
          >
            {String(tick).padStart(2, '0')}h
          </text>
        );
      })}

      {/* Columnas invisibles interactivas por cada hora */}
      {interactive &&
        chartPoints.map((pt, idx) => {
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
              onMouseEnter={() => onSelectTime?.(pointTime)}
              onClick={() => onToggleTime?.(pointTime)}
              onTouchStart={() => onSelectTime?.(pointTime)}
            />
          );
        })}
    </svg>
  );
}
