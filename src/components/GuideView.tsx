import { useState } from 'react';
import type { PlaceItem } from './SurfMap';
import { MapPin, Navigation, ExternalLink, Bed, GraduationCap, Wrench } from 'lucide-react';

interface GuideViewProps {
  places: PlaceItem[];
  onViewOnMap: (place: PlaceItem) => void;
}

const LABELS: Record<'all' | PlaceItem['category'], string> = {
  all: 'Todos',
  hostel: 'Hostels',
  school: 'Escuelas',
  surfShop: 'SurfShops',
  workshop: 'Talleres',
};

export default function GuideView({ places, onViewOnMap }: GuideViewProps) {
  const [filter, setFilter] = useState<'all' | PlaceItem['category']>('all');

  const filtered = filter === 'all' ? places : places.filter((p) => p.category === filter);

  const renderBadge = (category: PlaceItem['category']) => {
    if (category === 'hostel') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <Bed size={11} /> Hostel
        </span>
      );
    }
    if (category === 'school') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          <GraduationCap size={11} /> Escuela
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30">
        <Wrench size={11} /> Taller
      </span>
    );
  };

  return (
    <div className="p-4 pb-24 space-y-4">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Guía Surfer</h1>
          <p className="text-xs text-slate-400">Hostels, escuelas y talleres en MDQ, Chapa y Miramar</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'hostel', 'school', 'workshop'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors shrink-0 ${
                filter === cat
                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {LABELS[cat]}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-3">
        {filtered.map((place) => (
          <div
            key={place.id}
            className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-white text-base">{place.name}</h2>
                <span className="text-xs text-slate-400">{place.zone}</span>
              </div>
              {renderBadge(place.category)}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{place.description}</p>

            <div className="flex flex-wrap gap-1.5">
              {place.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-900/80 text-slate-300 border border-slate-700/80"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onViewOnMap(place)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-sky-400 text-xs font-semibold border border-slate-700"
              >
                <MapPin size={13} /> Ver en mapa
              </button>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
              >
                <Navigation size={13} /> Ruta
              </a>

              {place.instagram && (
                <a
                  href={place.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-slate-900 text-slate-200 text-xs border border-slate-700"
                  aria-label="Instagram"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA para sumar lugares reales */}
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-4 text-center space-y-1.5">
        <p className="text-sm font-semibold text-white">¿Tenés un hostel, escuela o taller?</p>
        <p className="text-xs text-slate-400">
          Sumá tu lugar gratis a la guía de la costa enviándonos tus datos.
        </p>
      </div>
    </div>
  );
}