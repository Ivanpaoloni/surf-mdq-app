import { useState } from 'react';
import type { DayPeriodId, DayTextSummary } from '../services/surfSummary';
import { ArrowDown, Star, Waves } from 'lucide-react';

interface DailySummaryCardProps {
  spotId: string;
  summary: DayTextSummary;
  onScrollToDay: (dayKey: string) => void;
}

const PERIOD_ORDER: readonly DayPeriodId[] = ['morning', 'midday', 'afternoon'];

export default function DailySummaryCard({
  spotId,
  summary,
  onScrollToDay,
}: DailySummaryCardProps) {
  const [selection, setSelection] = useState<{
    scopeKey: string;
    period: DayPeriodId;
  } | null>(null);

  const scopeKey = `${spotId}:${summary.dateKey}`;
  const activePeriodId: DayPeriodId =
    selection &&
    selection.scopeKey === scopeKey &&
    summary.periods[selection.period].hasData
      ? selection.period
      : summary.defaultPeriod;

  const activePeriod = summary.periods[activePeriodId];

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
      {/* Encabezado: fecha completa + acceso directo a las horas */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-900">{summary.fullDateLabel}</h3>
        <button
          type="button"
          onClick={() => onScrollToDay(summary.dateKey)}
          className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800 transition-colors cursor-pointer rounded-md px-1.5 py-0.5 -mr-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
        >
          Ver horas
          <ArrowDown size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Selector de 3 franjas diurnas */}
      <div
        role="tablist"
        aria-label="Franjas del día"
        className="grid grid-cols-3 gap-1 bg-zinc-100 p-0.5 rounded-xl border border-zinc-200/80"
      >
        {PERIOD_ORDER.map((id) => {
          const period = summary.periods[id];
          const isSelected = activePeriodId === id;

          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={!period.hasData}
              onClick={() => setSelection({ scopeKey, period: id })}
              className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
                !period.hasData
                  ? 'text-zinc-400 opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'bg-white text-zinc-900 font-medium shadow-xs cursor-pointer'
                    : 'text-zinc-600 hover:text-zinc-900 font-normal cursor-pointer'
              }`}
            >
              <span className="truncate">
                {period.label}
                <span className="hidden sm:inline text-[11px] font-normal text-zinc-400">
                  {' '}
                  · {period.rangeLabel}
                </span>
              </span>
              {period.hasBestWindow && (
                <Star
                  size={10}
                  strokeWidth={2}
                  fill="currentColor"
                  aria-label="Contiene la mejor ventana"
                  className="text-amber-500 shrink-0"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Cuerpo del resumen */}
      <p className="text-sm leading-relaxed text-zinc-700">{activePeriod.text}</p>

      {/* Referencia discreta de marea */}
      {activePeriod.tideNote && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 pt-2 border-t border-zinc-100 tabular-nums">
          <Waves size={12} strokeWidth={1.75} className="text-sky-600 shrink-0" />
          <span>{activePeriod.tideNote}</span>
        </div>
      )}
    </div>
  );
}
