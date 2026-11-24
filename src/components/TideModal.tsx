import { useEffect, useState } from 'react';
import {
  getDailyTidePeaks,
  getCurrentTideState,
  type ForecastData,
  type TidePeak,
} from '../services/openMeteo';
import { formatHourHHMM, parseClockToHours } from '../utils/surfFormat';
import TideCurveChart from './TideCurveChart';
import { X, Sunrise, Sunset } from 'lucide-react';

interface TideModalProps {
  isOpen: boolean;
  onClose: () => void;
  spotName: string;
  forecast: ForecastData[];
  initialDate?: string;
  nowMs?: number;
}

function getLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export default function TideModal({
  isOpen,
  onClose,
  spotName,
  forecast,
  initialDate,
  nowMs,
}: TideModalProps) {
  const [mountNowMs] = useState<number>(() => Date.now());
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

  const effectiveNowMs = nowMs ?? mountNowMs;
  const now = new Date(effectiveNowMs);
  const todayKey = getLocalDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrowKey = getLocalDateKey(tomorrowDate);

  // Días disponibles que tienen al menos un valor válido de marea
  const availableDates: string[] = [];
  for (const item of forecast) {
    if (typeof item.tideHeight === 'number' && Number.isFinite(item.tideHeight)) {
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

  const dayItems = forecast.filter(
    (f): f is ForecastData & { tideHeight: number } =>
      f.time.slice(0, 10) === selectedDate &&
      typeof f.tideHeight === 'number' &&
      Number.isFinite(f.tideHeight)
  );

  const sampleWithSun = dayItems.find((f) => f.sunrise || f.sunset);
  const sunriseStr = sampleWithSun?.sunrise ?? null;
  const sunsetStr = sampleWithSun?.sunset ?? null;

  const isTodaySelected = selectedDate === todayKey;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const sharedCurrentTide = isTodaySelected
    ? getCurrentTideState(forecast, effectiveNowMs)
    : null;

  const activeItem = activeTime
    ? (dayItems.find((item) => item.time === activeTime) ?? null)
    : null;

  const fallbackItem =
    dayItems.length > 0
      ? isTodaySelected
        ? dayItems.reduce((best, item) => {
            const hBest = parseClockToHours(best.time.slice(11, 16), 0);
            const hItem = parseClockToHours(item.time.slice(11, 16), 0);
            return Math.abs(hItem - nowHour) < Math.abs(hBest - nowHour) ? item : best;
          })
        : dayItems[0]
      : null;

  const readoutTime = activeItem
    ? formatHourHHMM(activeItem.time)
    : isTodaySelected && sharedCurrentTide
      ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      : fallbackItem
        ? formatHourHHMM(fallbackItem.time)
        : null;

  const readoutHeight = activeItem
    ? activeItem.tideHeight
    : isTodaySelected && sharedCurrentTide
      ? sharedCurrentTide.height
      : (fallbackItem?.tideHeight ?? null);

  const readoutTrend = activeItem
    ? (activeItem.tideTrend ?? null)
    : isTodaySelected && sharedCurrentTide
      ? sharedCurrentTide.trend
      : (fallbackItem?.tideTrend ?? null);

  const isShowingNow = !activeItem && isTodaySelected && sharedCurrentTide !== null;

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
        className="w-full sm:max-w-lg bg-white border-t sm:border border-zinc-200 rounded-t-2xl sm:rounded-2xl sm:shadow-xl max-h-[85vh] overflow-y-auto px-4 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] sm:pb-6"
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
                  className={`px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 tabular-nums cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
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
                <div className="hidden sm:flex items-center gap-2 text-[11px] font-normal text-zinc-500 shrink-0">
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

            {/* Gráfico SVG reutilizable */}
            <div className="bg-white border border-zinc-200/80 rounded-xl p-2">
              <TideCurveChart
                forecast={forecast}
                dateKey={selectedDate}
                dayPeaks={dayPeaks}
                nowMs={effectiveNowMs}
                activeTime={activeTime}
                onSelectTime={(time) =>
                  setActiveSelection(time ? { date: selectedDate, time } : null)
                }
                onToggleTime={(time) =>
                  setActiveSelection((prev) =>
                    prev && prev.time === time ? null : { date: selectedDate, time }
                  )
                }
              />
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
