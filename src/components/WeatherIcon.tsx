import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
} from 'lucide-react';

interface WeatherIconProps {
  code: number | null | undefined;
  isNight?: boolean;
  className?: string;
}

export default function WeatherIcon({
  code,
  isNight = false,
  className = 'w-4 h-4 shrink-0',
}: WeatherIconProps) {
  if (typeof code !== 'number' || !Number.isFinite(code)) {
    return null;
  }
  if (code === 0) {
    return isNight ? (
      <Moon strokeWidth={1.75} className={`${className} text-indigo-500`} />
    ) : (
      <Sun strokeWidth={1.75} className={`${className} text-amber-500`} />
    );
  }
  if (code === 1 || code === 2) {
    return isNight ? (
      <CloudMoon strokeWidth={1.75} className={`${className} text-indigo-400`} />
    ) : (
      <CloudSun strokeWidth={1.75} className={`${className} text-amber-500`} />
    );
  }
  if (code === 3) {
    return <Cloud strokeWidth={1.75} className={`${className} text-zinc-500`} />;
  }
  if (code === 45 || code === 48) {
    return <CloudFog strokeWidth={1.75} className={`${className} text-zinc-400`} />;
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain strokeWidth={1.75} className={`${className} text-sky-600`} />;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <CloudSnow strokeWidth={1.75} className={`${className} text-sky-500`} />;
  }
  if (code >= 95 && code <= 99) {
    return <CloudLightning strokeWidth={1.75} className={`${className} text-amber-600`} />;
  }
  return <Cloud strokeWidth={1.75} className={`${className} text-zinc-400`} />;
}
