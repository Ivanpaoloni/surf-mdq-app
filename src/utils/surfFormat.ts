import type { SwellDirectionQuality } from '../services/surfExtras';

export function degToCompass(deg: number): string {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
  ];
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.round(normalized / 22.5) % 16];
}

export function formatDayLabel(date: Date): string {
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

export function formatHourHHMM(isoTime: string): string {
  const timeObj = new Date(isoTime);
  if (Number.isNaN(timeObj.getTime())) return isoTime.slice(11, 16);
  return timeObj.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatLastUpdated(timestamp: number, nowMs?: number): string {
  const dt = new Date(timestamp);
  if (Number.isNaN(dt.getTime())) return '';

  const hhmm = dt.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const ref = nowMs !== undefined ? new Date(nowMs) : new Date();
  const yesterday = new Date(ref);
  yesterday.setDate(ref.getDate() - 1);

  if (dt.toDateString() === ref.toDateString()) return hhmm;
  if (dt.toDateString() === yesterday.toDateString()) return `ayer ${hhmm}`;

  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} ${hhmm}`;
}

export function getSwellQualityColor(quality: SwellDirectionQuality): string {
  if (quality === 'good') return 'text-emerald-600';
  if (quality === 'fair') return 'text-amber-500';
  return 'text-rose-500';
}

export function getEnergySegmentColor(level: 1 | 2 | 3 | 4): string {
  if (level === 1) return 'bg-zinc-400';
  if (level === 2) return 'bg-sky-600';
  if (level === 3) return 'bg-emerald-600';
  return 'bg-amber-500';
}

export function getStarsLabel(stars: number): string {
  if (stars === 0) return 'Muy chico';
  if (stars === 1) return 'Flojo';
  if (stars === 2) return 'Surfeable';
  if (stars === 3) return 'Bueno';
  if (stars === 4) return 'Muy bueno';
  return 'Épico';
}

export function getWindTextColor(quality: string): string {
  if (quality === 'offshore') return 'text-emerald-700';
  if (quality === 'cross') return 'text-amber-700';
  return 'text-rose-700';
}

export function getWindDotColor(quality: string): string {
  if (quality === 'offshore') return 'bg-emerald-600';
  if (quality === 'cross') return 'bg-amber-500';
  return 'bg-rose-600';
}
