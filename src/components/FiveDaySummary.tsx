import { useState } from 'react';
import { Star } from 'lucide-react';
import type { ForecastData, TidePeak } from '../services/openMeteo';
import type { DailySummary, SpotConfig } from '../services/surfRating';
import { buildDayTextSummary } from '../services/surfSummary';
import { getWindDotColor } from '../utils/surfFormat';
import DailySummaryCard from './DailySummaryCard';

interface FiveDaySummaryProps {
  spot: SpotConfig;
  summaries: DailySummary[];
  forecast: ForecastData[];
  dailyTidePeaks: Record<string, TidePeak[]>;
  todayKey: string;
  currentHourTime: string | null;
  nowMs: number;
  onScrollToDay: (dayKey: string) => void;
}

export default function FiveDaySummary({
  spot,
  summaries,
  forecast,
  dailyTidePeaks,
  todayKey,
  currentHourTime,
  nowMs,
  onScrollToDay,
}: FiveDaySummaryProps) {
  const [selection, setSelection] = useState<{
    spotId: string;
    dayKey: string;
  } | null>(null);

  if (summaries.length === 0) return null;

  const selectedDayKey =
    selection &&
    selection.spotId === spot.id &&
    summaries.some((s) => s.dayKey === selection.dayKey)
      ? selection.dayKey
      : summaries[0].dayKey;

  const selectedDayHours = forecast.filter(
    (item) => item.time.slice(0, 10) === selectedDayKey
  );

  const dayTextSummary = buildDayTextSummary(selectedDayHours, spot, selectedDayKey, {
    dayPeaks: dailyTidePeaks[selectedDayKey] ?? [],
    isToday: selectedDayKey === todayKey,
    currentHourTime,
    nowMs,
  });

  return (
    <section aria-label="Panorama de 5 días" className="space-y-2">
      <div className="px-1 h-7 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-600">Próximos 5 días</h2>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-5 gap-1.5">
          {summaries.map((day) => {
            const isSelected = selectedDayKey === day.dayKey;
            const isBest = day.isBestDay;

            let cardStyle =
              'bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50/80';
            if (isSelected && isBest) {
              cardStyle =
                'border-amber-400 bg-amber-50/80 ring-2 ring-amber-400/80 shadow-xs';
            } else if (isSelected) {
              cardStyle =
                'border-zinc-800 bg-zinc-50 ring-2 ring-zinc-800/80 shadow-xs';
            } else if (isBest) {
              cardStyle =
                'border-amber-300 bg-amber-50/40 hover:bg-amber-50/70 text-zinc-900';
            }

            return (
              <button
                key={day.dayKey}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelection({ spotId: spot.id, dayKey: day.dayKey })}
                aria-label={`${day.shortLabel} ${day.dayNumber}: olas ${day.swellHeight.toFixed(1)}m, ${day.maxStars} estrellas, viento ${day.windQuality}${isBest ? ', mejor día' : ''}`}
                className={`rounded-xl border py-2 px-1 flex flex-col items-center gap-1 active:scale-[0.98] transition cursor-pointer text-center w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${cardStyle}`}
              >
                {/* Arriba: shortLabel y dayNumber */}
                <div className="flex flex-col items-center leading-none gap-0.5">
                  <span
                    className={`text-[11px] font-medium leading-none ${
                      isBest && !isSelected ? 'text-amber-900' : 'text-zinc-600'
                    }`}
                  >
                    {day.shortLabel}
                  </span>
                  <span className="text-[10px] text-zinc-400 leading-none tabular-nums">
                    {day.dayNumber}
                  </span>
                </div>

                {/* Centro: altura Swell 1 */}
                <div className="text-xs sm:text-sm font-semibold text-zinc-900 tabular-nums leading-none my-0.5">
                  {day.swellHeight.toFixed(1)}m
                </div>

                {/* Abajo: estrellas + punto indicador de viento */}
                <div className="flex items-center gap-1 leading-none">
                  <div className="flex items-center gap-0.5 tabular-nums">
                    <Star
                      size={11}
                      strokeWidth={1.75}
                      fill={day.maxStars > 0 ? 'currentColor' : 'none'}
                      className={day.maxStars > 0 ? 'text-amber-500' : 'text-zinc-300'}
                    />
                    <span
                      className={`text-[11px] font-medium leading-none ${
                        day.maxStars > 0 ? 'text-zinc-700' : 'text-zinc-400'
                      }`}
                    >
                      {day.maxStars}
                    </span>
                  </div>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${getWindDotColor(day.windQuality)}`}
                    title={`Viento ${day.windQuality}`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <DailySummaryCard
          spotId={spot.id}
          summary={dayTextSummary}
          onScrollToDay={onScrollToDay}
        />
      </div>
    </section>
  );
}
