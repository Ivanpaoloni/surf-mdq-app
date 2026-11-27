import { useEffect } from 'react';
import type { ForecastData } from '../services/openMeteo';
import {
  calculateSurfRating,
  calculateWaveEnergyKj,
  type SpotConfig,
} from '../services/surfRating';
import { getSwellDirectionQuality } from '../services/surfExtras';
import {
  degToCompass,
  formatWindQualityLabel,
  getSwellQualityColor,
  getWindTextColor,
} from '../utils/surfFormat';
import { AlertCircle, ArrowDown, RotateCw, Star, X } from 'lucide-react';

interface TopSpotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  spots: SpotConfig[];
  spotsCurrent: Record<string, ForecastData>;
  selectedSpotId: string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectSpot: (spot: SpotConfig) => void;
}

export default function TopSpotsModal({
  isOpen,
  onClose,
  spots,
  spotsCurrent,
  selectedSpotId,
  loading,
  error,
  onRefresh,
  onSelectSpot,
}: TopSpotsModalProps) {
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

  const rankedSpots = spots
    .map((spot) => {
      const cond = spotsCurrent[spot.id];
      if (!cond) return null;

      const rating = calculateSurfRating(cond, spot);
      const swell1 = cond.primarySwell ?? {
        height: cond.waveHeight,
        period: cond.wavePeriod,
        direction: cond.waveDirection,
      };
      const swellQuality = getSwellDirectionQuality(swell1.direction, spot.idealSwellDeg);
      const energyKj = calculateWaveEnergyKj(swell1.height, swell1.period).kj;
      const windRank =
        rating.windQuality === 'offshore' ? 3 : rating.windQuality === 'cross' ? 2 : 1;

      return { spot, cond, rating, swell1, swellQuality, energyKj, windRank };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => {
      if (b.rating.stars !== a.rating.stars) return b.rating.stars - a.rating.stars;
      if (b.windRank !== a.windRank) return b.windRank - a.windRank;
      if (b.energyKj !== a.energyKj) return b.energyKj - a.energyKj;
      return b.swell1.height - a.swell1.height;
    });

  const hasData = rankedSpots.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mejores playas ahora"
      onClick={onClose}
      className="fixed inset-0 z-1200 flex items-end sm:items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white border-t sm:border border-zinc-200 rounded-t-2xl sm:rounded-2xl sm:shadow-xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header fijo del modal */}
        <div className="px-4 pt-3 pb-3 border-b border-zinc-100 shrink-0">
          <div className="w-9 h-1 rounded-full bg-zinc-200 mx-auto mb-3 sm:hidden" />

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-medium text-zinc-900 truncate">
                Mejores ahora
              </h2>
              <p className="text-xs font-normal text-zinc-500 tabular-nums">
                {spots.length} playas · ordenadas por condiciones actuales
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refrescar ranking de playas"
                title="Refrescar"
                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
              >
                <RotateCw
                  size={15}
                  strokeWidth={1.75}
                  className={loading ? 'animate-spin' : ''}
                />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar comparador"
                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="overflow-y-auto flex-1 pb-[max(2rem,env(safe-area-inset-bottom))] sm:pb-5">
          {loading && !hasData ? (
            <div className="divide-y divide-zinc-100 px-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="py-3 flex items-center justify-between gap-3 animate-pulse"
                >
                  <div className="flex items-center gap-2.5 flex-1">
                    <div className="h-4 w-5 rounded bg-zinc-100" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 w-32 rounded bg-zinc-100" />
                      <div className="h-3 w-24 rounded bg-zinc-100" />
                    </div>
                  </div>
                  <div className="space-y-1.5 flex flex-col items-end">
                    <div className="h-4 w-20 rounded bg-zinc-100" />
                    <div className="h-3 w-16 rounded bg-zinc-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : error && !hasData ? (
            <div className="p-6 text-center space-y-3">
              <div className="mx-auto w-9 h-9 rounded-full bg-rose-50 border border-rose-200/70 flex items-center justify-center">
                <AlertCircle size={18} strokeWidth={1.75} className="text-rose-600" />
              </div>
              <p className="text-sm font-normal text-zinc-600">{error}</p>
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
              >
                <RotateCw size={14} strokeWidth={1.75} />
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mx-4 mt-3 flex items-center justify-between gap-2 bg-amber-50/80 border border-amber-200/80 rounded-xl px-3 py-2 text-xs text-amber-900">
                  <span className="min-w-0">Sin conexión · Mostrando último estado</span>
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="shrink-0 font-medium underline underline-offset-2 cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              <div className="divide-y divide-zinc-100">
                {rankedSpots.map(
                  ({ spot, cond, rating, swell1, swellQuality }, index) => {
                    const isSelected = spot.id === selectedSpotId;
                    const rank = index + 1;

                    return (
                      <button
                        key={spot.id}
                        type="button"
                        onClick={() => {
                          onSelectSpot(spot);
                          onClose();
                        }}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2.5 transition-colors cursor-pointer hover:bg-zinc-50 active:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-300 ${
                          isSelected ? 'bg-sky-50/50' : ''
                        }`}
                      >
                        {/* Posición + nombre + zona + estrellas */}
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span
                            className={`text-xs font-medium tabular-nums w-6 pt-0.5 shrink-0 ${
                              rank <= 3 ? 'text-zinc-800' : 'text-zinc-400'
                            }`}
                          >
                            #{rank}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium text-zinc-900 truncate">
                                {spot.name}
                              </span>
                              {isSelected && (
                                <span className="text-[10px] font-medium text-sky-700 bg-sky-100/80 px-1.5 py-0.5 rounded shrink-0">
                                  Actual
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 mt-1 min-w-0">
                              <span className="text-xs font-normal text-zinc-500 truncate">
                                {spot.zone}
                              </span>
                              <span className="text-zinc-300 shrink-0">·</span>
                              <div
                                className="flex items-center gap-0.5 shrink-0"
                                aria-label={`${rating.stars} de 5 estrellas`}
                              >
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    size={11}
                                    strokeWidth={1.75}
                                    fill={i < rating.stars ? 'currentColor' : 'none'}
                                    className={
                                      i < rating.stars ? 'text-amber-500' : 'text-zinc-300'
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Swell 1 + Viento */}
                        <div className="flex flex-col items-end shrink-0 tabular-nums">
                          <div className="flex items-center gap-1 text-sm leading-tight">
                            <span className="font-semibold text-zinc-900">
                              {swell1.height.toFixed(1)}
                              <span className="text-xs font-normal text-zinc-500 ml-0.5">m</span>
                            </span>
                            <span className="text-zinc-300 text-xs">·</span>
                            <span className="text-xs font-normal text-zinc-600">
                              {Math.round(swell1.period)}s
                            </span>
                            <ArrowDown
                              size={12}
                              strokeWidth={2}
                              className={getSwellQualityColor(swellQuality)}
                              style={{ transform: `rotate(${swell1.direction}deg)` }}
                            />
                            <span className="text-xs font-normal text-zinc-600">
                              {degToCompass(swell1.direction)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-xs font-normal mt-1">
                            <span className="text-zinc-700 font-medium">
                              {Math.round(cond.windSpeed)} km/h
                            </span>
                            <span className="text-zinc-300">·</span>
                            <span className={getWindTextColor(rating.windQuality)}>
                              {formatWindQualityLabel(rating.windQuality)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
