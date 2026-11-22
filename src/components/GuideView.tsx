import { useState } from 'react';
import type { PlaceItem } from './SurfMap';
import { MapPin, Navigation, ExternalLink, MessageCircle } from 'lucide-react';

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

const CATEGORY_INDICATOR: Record<
  PlaceItem['category'],
  { label: string; dotClass: string }
> = {
  hostel: { label: 'Hostel', dotClass: 'bg-purple-600' },
  school: { label: 'Escuela', dotClass: 'bg-sky-600' },
  surfShop: { label: 'SurfShop', dotClass: 'bg-amber-500' },
  workshop: { label: 'Taller', dotClass: 'bg-orange-600' },
};

export default function GuideView({ places, onViewOnMap }: GuideViewProps) {
  const [filter, setFilter] = useState<'all' | PlaceItem['category']>('all');

  const filtered = filter === 'all' ? places : places.filter((p) => p.category === filter);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-20 space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-medium text-zinc-900 tracking-tight">Guía Surfer</h1>
          <p className="text-sm font-normal text-zinc-600 mt-0.5">
            Hostels, escuelas, surfshops y talleres en MDQ, Chapa y Miramar
          </p>
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {(['all', 'hostel', 'school', 'surfShop', 'workshop'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs border transition-colors shrink-0 ${
                filter === cat
                  ? 'bg-zinc-900 text-white border-zinc-900 font-medium'
                  : 'bg-white text-zinc-700 hover:bg-zinc-100 border-zinc-200 font-normal'
              }`}
            >
              {LABELS[cat]}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-3">
        {filtered.map((place) => {
          const indicator = CATEGORY_INDICATOR[place.category];

          return (
            <article
              key={place.id}
              className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium text-zinc-900 leading-snug">
                    {place.name}
                  </h2>
                  <span className="text-xs font-normal text-zinc-500">{place.zone}</span>
                </div>

                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 shrink-0 pt-0.5">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${indicator.dotClass}`}
                  />
                  {indicator.label}
                </span>
              </div>

              <p className="text-sm font-normal text-zinc-600 leading-relaxed">
                {place.description}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {place.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-normal px-2.5 py-0.5 rounded-md bg-zinc-50 text-zinc-600 border border-zinc-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => onViewOnMap(place)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-sm font-medium border border-zinc-200 transition-colors"
                >
                  <MapPin size={14} strokeWidth={1.75} className="text-zinc-600" />
                  Mapa
                </button>

                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-sm font-medium border border-zinc-200 transition-colors"
                >
                  <Navigation size={14} strokeWidth={1.75} className="text-zinc-600" />
                  Ruta
                </a>

                {place.instagram && (
                  <a
                    href={place.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-sm font-medium border border-zinc-200 transition-colors"
                    aria-label="Instagram"
                  >
                    <ExternalLink size={14} strokeWidth={1.75} className="text-zinc-600" />
                    Instagram
                  </a>
                )}

                {place.whatsapp && (
                  <a
                    href={`https://wa.me/${place.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-emerald-700 text-sm font-medium border border-zinc-200 transition-colors"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle size={14} strokeWidth={1.75} />
                    WhatsApp
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* CTA para sumar lugares reales */}
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center space-y-1">
        <p className="text-sm font-medium text-zinc-900">
          ¿Tenés un hostel, escuela, surfshop o taller?
        </p>
        <p className="text-sm font-normal text-zinc-600">
          Sumá tu lugar gratis a la guía de la costa enviándonos tus datos.
        </p>
      </div>
    </div>
  );
}
