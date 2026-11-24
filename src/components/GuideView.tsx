import { useState } from 'react';
import type { PlaceCategory, PlaceCity, PlaceItem } from './SurfMap';
import { MapPin, Navigation, ExternalLink, MessageCircle, Globe } from 'lucide-react';

interface GuideViewProps {
  places: PlaceItem[];
  onViewOnMap: (place: PlaceItem) => void;
}

const CATEGORY_LABELS: Record<'all' | PlaceCategory, string> = {
  all: 'Todos',
  school: 'Escuelas',
  hostel: 'Hostels',
  shop: 'Surfshops',
  workshop: 'Talleres',
};

const CITY_OPTIONS: readonly ('all' | PlaceCity)[] = [
  'all',
  'Mar del Plata',
  'Chapadmalal',
  'Miramar',
];

const CATEGORY_INDICATOR: Record<
  PlaceCategory,
  { label: string; dotClass: string }
> = {
  school: { label: 'Escuela', dotClass: 'bg-sky-600' },
  hostel: { label: 'Hostel', dotClass: 'bg-purple-600' },
  shop: { label: 'Surfshop', dotClass: 'bg-amber-500' },
  workshop: { label: 'Taller', dotClass: 'bg-orange-600' },
};

function getGoogleMapsSearchUrl(place: PlaceItem): string {
  if (place.mapsUrl) return place.mapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.name} ${place.lat},${place.lon}`
  )}`;
}

export default function GuideView({ places, onViewOnMap }: GuideViewProps) {
  const [cityFilter, setCityFilter] = useState<'all' | PlaceCity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PlaceCategory>('all');

  const filtered = places.filter((p) => {
    if (cityFilter !== 'all' && p.city !== cityFilter) return false;
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10 space-y-4">
      <header className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-medium text-zinc-900 tracking-tight">Guía Surfer</h1>
            <p className="text-sm font-normal text-zinc-600 mt-0.5">
              Escuelas, hostels, surfshops y talleres en la costa
            </p>
          </div>
          <span className="text-xs font-normal text-zinc-500 tabular-nums shrink-0">
            {filtered.length} {filtered.length === 1 ? 'lugar' : 'lugares'}
          </span>
        </div>

        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
          {/* Filtro por ciudad */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 md:pb-0">
            {CITY_OPTIONS.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => setCityFilter(city)}
                className={`px-3 py-1.5 rounded-xl text-xs border transition-colors shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
                  cityFilter === city
                    ? 'bg-zinc-900 text-white border-zinc-900 font-medium'
                    : 'bg-white text-zinc-700 hover:bg-zinc-100 border-zinc-200 font-normal'
                }`}
              >
                {city === 'all' ? 'Todas' : city}
              </button>
            ))}
          </div>

          {/* Filtro por categoría */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 md:pb-0">
            {(['all', 'school', 'hostel', 'shop', 'workshop'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs border transition-colors shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
                  categoryFilter === cat
                    ? 'bg-zinc-900 text-white border-zinc-900 font-medium'
                    : 'bg-white text-zinc-700 hover:bg-zinc-100 border-zinc-200 font-normal'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center space-y-2.5">
          <p className="text-sm font-normal text-zinc-600">
            No encontramos lugares con esa combinación de filtros.
          </p>
          <button
            type="button"
            onClick={() => {
              setCityFilter('all');
              setCategoryFilter('all');
            }}
            className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            Ver todos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {filtered.map((place) => {
            const indicator = CATEGORY_INDICATOR[place.category];
            const showCity = cityFilter === 'all' && place.zone !== place.city;

            return (
              <article
                key={place.id}
                className="bg-white border border-zinc-200 rounded-2xl p-4 h-full flex flex-col justify-between gap-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-medium text-zinc-900 leading-snug">
                        {place.name}
                      </h2>
                      <div className="text-xs font-normal text-zinc-500 mt-0.5">
                        {place.zone}
                        {showCity && (
                          <>
                            <span className="text-zinc-300 mx-1">·</span>
                            <span>{place.city}</span>
                          </>
                        )}
                      </div>
                      {place.address && (
                        <p className="text-xs font-normal text-zinc-500 mt-0.5">{place.address}</p>
                      )}
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
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onViewOnMap(place)}
                    className="flex-1 min-w-28 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-medium border border-zinc-200 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  >
                    <MapPin size={13} strokeWidth={1.75} className="text-zinc-600" />
                    Mapa
                  </button>

                  <a
                    href={getGoogleMapsSearchUrl(place)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-medium border border-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  >
                    <Navigation size={13} strokeWidth={1.75} className="text-zinc-600" />
                    Ver en Maps
                  </a>

                  {place.website && (
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-medium border border-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                    >
                      <Globe size={13} strokeWidth={1.75} className="text-zinc-600" />
                      Web
                    </a>
                  )}

                  {place.instagram && (
                    <a
                      href={place.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-medium border border-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                      aria-label="Instagram"
                    >
                      <ExternalLink size={13} strokeWidth={1.75} className="text-zinc-600" />
                      Instagram
                    </a>
                  )}

                  {place.whatsapp && (
                    <a
                      href={`https://wa.me/${place.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-emerald-700 text-xs font-medium border border-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                      aria-label="WhatsApp"
                    >
                      <MessageCircle size={13} strokeWidth={1.75} />
                      WhatsApp
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

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
