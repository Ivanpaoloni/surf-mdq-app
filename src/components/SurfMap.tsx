import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { calculateSurfRating, type SpotConfig } from '../services/surfRating';
import type { ForecastData } from '../services/openMeteo';
import {
  Star,
  Navigation,
  X,
  Waves,
  Bed,
  GraduationCap,
  Wrench,
  Layers,
  ShirtIcon,
  ExternalLink,
} from 'lucide-react';

export interface PlaceItem {
  id: string;
  name: string;
  category: 'hostel' | 'school' | 'surfShop' | 'workshop';
  zone: string;
  lat: number;
  lon: number;
  description: string;
  tags: string[];
  instagram?: string;
  whatsapp?: string;
}

interface SurfMapProps {
  spots: SpotConfig[];
  spotsCurrent: Record<string, ForecastData>;
  places: PlaceItem[];
  loading: boolean;
  focusTarget: { lat: number; lon: number; id?: string } | null;
  onOpenSpotForecast: (spot: SpotConfig) => void;
}

type SelectedItem =
  | { kind: 'spot'; data: SpotConfig }
  | { kind: 'place'; data: PlaceItem }
  | null;

const CATEGORY_META: Record<
  PlaceItem['category'],
  { label: string; color: string; short: string }
> = {
  hostel: { label: 'Hostels', color: '#7e22ce', short: 'H' },
  school: { label: 'Escuelas', color: '#0369a1', short: 'E' },
  surfShop: { label: 'SurfShop', color: '#b45309', short: 'S' },
  workshop: { label: 'Talleres', color: '#c2410c', short: 'T' },
};

function getSpotPinColor(stars: number | null): string {
  if (stars === null) return '#52525b';
  if (stars === 0) return '#71717a';
  if (stars <= 2) return '#d97706';
  return '#059669';
}

function getWindTextColor(quality: string): string {
  if (quality === 'offshore') return 'text-emerald-700';
  if (quality === 'cross') return 'text-amber-700';
  return 'text-rose-700';
}

export default function SurfMap({
  spots,
  spotsCurrent,
  places,
  loading,
  focusTarget,
  onOpenSpotForecast,
}: SurfMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [selected, setSelected] = useState<SelectedItem>(null);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');
  const [layers, setLayers] = useState({
    spots: true,
    hostel: true,
    school: true,
    surfShop: true,
    workshop: true,
  });

  // 1. Inicializar mapa una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-38.11, -57.62],
      zoom: 11,
      zoomControl: false,
    });

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', () => setSelected(null));

    // TODO: borrar en deploy
    map.on('contextmenu', (e) => {
      const coords = `"lat": ${e.latlng.lat.toFixed(5)}, "lon": ${e.latlng.lng.toFixed(5)}`;
      navigator.clipboard?.writeText(coords);
      alert(`Copiado:\n${coords}`);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // 2. Cambiar entre mapa oscuro nativo y Satélite (ambos de Esri, sin API Key)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }

    const baseLayers =
      mapStyle === 'dark'
        ? [
            L.tileLayer(
              'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
              { attribution: 'Tiles &copy; Esri', maxNativeZoom: 16, maxZoom: 18 }
            ),
            L.tileLayer(
              'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
              { maxNativeZoom: 16, maxZoom: 18 }
            ),
          ]
        : [
            L.tileLayer(
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              { attribution: 'Tiles &copy; Esri', maxNativeZoom: 17, maxZoom: 18 }
            ),
            L.tileLayer(
              'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
              { maxNativeZoom: 17, maxZoom: 18 }
            ),
          ];

    baseLayerRef.current = L.layerGroup(baseLayers).addTo(map);
  }, [mapStyle]);

  // 3. Centrar el mapa si venimos desde "Ver en mapa" en la Guía
  useEffect(() => {
    if (!focusTarget || !mapRef.current) return;
    mapRef.current.setView([focusTarget.lat, focusTarget.lon], 14, { animate: true });
    if (focusTarget.id) {
      const foundPlace = places.find((p) => p.id === focusTarget.id);
      if (foundPlace) setSelected({ kind: 'place', data: foundPlace });
    }
  }, [focusTarget, places]);

  // 4. Dibujar pines
  useEffect(() => {
    const layerGroup = markersLayerRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();

    if (layers.spots) {
      spots.forEach((spot) => {
        const cond = spotsCurrent[spot.id];
        const rating = cond ? calculateSurfRating(cond, spot) : null;
        const bg = getSpotPinColor(rating ? rating.stars : null);
        const label = rating ? `${rating.stars}★` : '·';

        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${bg};color:#ffffff;font-weight:600;font-variant-numeric:tabular-nums;font-size:12px;padding:2px 8px;border-radius:999px;border:1.5px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;">${label}</div>`,
          iconSize: [38, 24],
          iconAnchor: [19, 12],
        });

        const marker = L.marker([spot.lat, spot.lon], { icon });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelected({ kind: 'spot', data: spot });
        });
        marker.addTo(layerGroup);
      });
    }

    places.forEach((place) => {
      if (!layers[place.category]) return;
      const meta = CATEGORY_META[place.category];

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#ffffff;color:${meta.color};font-weight:600;font-size:11px;width:25px;height:25px;border-radius:8px;border:1.5px solid ${meta.color};box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">${meta.short}</div>`,
        iconSize: [25, 25],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([place.lat, place.lon], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelected({ kind: 'place', data: place });
      });
      marker.addTo(layerGroup);
    });
  }, [spots, spotsCurrent, places, layers]);

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedSpotCond =
    selected?.kind === 'spot' ? spotsCurrent[selected.data.id] : undefined;
  const selectedSpotRating =
    selected?.kind === 'spot' && selectedSpotCond
      ? calculateSurfRating(selectedSpotCond, selected.data)
      : null;

  return (
    <div className="relative h-[calc(100vh-56px)] w-full overflow-hidden bg-zinc-100">
      {/* Chips flotantes de capas */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => toggleLayer('spots')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors ${
            layers.spots
              ? 'bg-white/95 text-zinc-900 border-zinc-300 font-medium'
              : 'bg-white/80 text-zinc-500 border-zinc-200 font-normal'
          }`}
        >
          <Waves
            size={13}
            strokeWidth={1.75}
            className={layers.spots ? 'text-emerald-600' : 'text-zinc-400'}
          />
          Olas
        </button>

        <button
          onClick={() => toggleLayer('hostel')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors ${
            layers.hostel
              ? 'bg-white/95 text-zinc-900 border-zinc-300 font-medium'
              : 'bg-white/80 text-zinc-500 border-zinc-200 font-normal'
          }`}
        >
          <Bed
            size={13}
            strokeWidth={1.75}
            className={layers.hostel ? 'text-purple-700' : 'text-zinc-400'}
          />
          Hostels
        </button>

        <button
          onClick={() => toggleLayer('school')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors ${
            layers.school
              ? 'bg-white/95 text-zinc-900 border-zinc-300 font-medium'
              : 'bg-white/80 text-zinc-500 border-zinc-200 font-normal'
          }`}
        >
          <GraduationCap
            size={13}
            strokeWidth={1.75}
            className={layers.school ? 'text-sky-700' : 'text-zinc-400'}
          />
          Escuelas
        </button>

        <button
          onClick={() => toggleLayer('workshop')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors ${
            layers.workshop
              ? 'bg-white/95 text-zinc-900 border-zinc-300 font-medium'
              : 'bg-white/80 text-zinc-500 border-zinc-200 font-normal'
          }`}
        >
          <Wrench
            size={13}
            strokeWidth={1.75}
            className={layers.workshop ? 'text-orange-700' : 'text-zinc-400'}
          />
          Talleres
        </button>

        <button
          onClick={() => toggleLayer('surfShop')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors ${
            layers.surfShop
              ? 'bg-white/95 text-zinc-900 border-zinc-300 font-medium'
              : 'bg-white/80 text-zinc-500 border-zinc-200 font-normal'
          }`}
        >
          <ShirtIcon
            size={13}
            strokeWidth={1.75}
            className={layers.surfShop ? 'text-amber-700' : 'text-zinc-400'}
          />
          SurfShop
        </button>
      </div>

      {/* Botón para alternar Mapa Oscuro / Satélite */}
      <button
        onClick={() => setMapStyle((prev) => (prev === 'dark' ? 'satellite' : 'dark'))}
        className="absolute top-14 right-3 z-[1000] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/95 backdrop-blur-sm border border-zinc-200 shadow-sm text-zinc-900 hover:bg-zinc-50 transition-colors"
      >
        <Layers size={14} strokeWidth={1.75} className="text-zinc-600" />
        {mapStyle === 'dark' ? 'Satélite' : 'Mapa'}
      </button>

      {/* Indicador sutil mientras carga el lote */}
      {loading && (
        <div className="absolute top-14 left-3 z-[1000] bg-white/95 backdrop-blur-sm border border-zinc-200 shadow-sm text-zinc-800 text-xs font-medium px-3 py-1.5 rounded-xl">
          Actualizando olas...
        </div>
      )}

      {/* Contenedor del mapa */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* Bottom Sheet claro de alto contraste */}
      {selected && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white border-t border-zinc-200 rounded-t-2xl px-4 pt-3 pb-4">
          <div className="max-w-xl mx-auto">
            <div className="w-9 h-1 rounded-full bg-zinc-200 mx-auto mb-3" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-normal text-zinc-500">
                  {selected.kind === 'spot'
                    ? selected.data.zone
                    : `${CATEGORY_META[selected.data.category].label} · ${selected.data.zone}`}
                </p>
                <h2 className="text-lg font-medium text-zinc-900 leading-snug mt-0.5">
                  {selected.data.name}
                </h2>
              </div>

              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors"
                aria-label="Cerrar"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            {selected.kind === 'spot' ? (
              <div className="mt-3.5 space-y-3.5">
                {selectedSpotCond && selectedSpotRating ? (
                  <div className="grid grid-cols-3 divide-x divide-zinc-200 bg-zinc-50 border border-zinc-200 rounded-xl py-3 text-center">
                    <div className="px-2">
                      <div className="text-xs font-normal text-zinc-500">Ahora</div>
                      <div className="flex justify-center gap-0.5 mt-1.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={13}
                            strokeWidth={1.75}
                            fill={i < selectedSpotRating.stars ? 'currentColor' : 'none'}
                            className={
                              i < selectedSpotRating.stars ? 'text-amber-500' : 'text-zinc-300'
                            }
                          />
                        ))}
                      </div>
                    </div>

                    <div className="px-2">
                      <div className="text-xs font-normal text-zinc-500">Ola</div>
                      <div className="mt-1 whitespace-nowrap tabular-nums">
                        <span
                          className={`text-base ${
                            selectedSpotRating.maxHeight === 0
                              ? 'font-medium text-zinc-400'
                              : 'font-semibold text-zinc-900'
                          }`}
                        >
                          {selectedSpotRating.maxHeight === 0
                            ? 'Flat'
                            : `${selectedSpotRating.minHeight.toFixed(1)}-${selectedSpotRating.maxHeight.toFixed(1)}m`}
                        </span>
                      </div>
                      <div className="text-xs font-normal text-zinc-600 tabular-nums mt-0.5">
                        {selectedSpotCond.wavePeriod.toFixed(0)}s
                      </div>
                    </div>

                    <div className="px-2">
                      <div className="text-xs font-normal text-zinc-500">Viento</div>
                      <div className="text-base font-medium text-zinc-900 mt-1 tabular-nums">
                        {selectedSpotCond.windSpeed.toFixed(0)}{' '}
                        <span className="text-xs font-normal text-zinc-500">km/h</span>
                      </div>
                      <div
                        className={`text-xs font-normal capitalize mt-0.5 ${getWindTextColor(selectedSpotRating.windQuality)}`}
                      >
                        {selectedSpotRating.windQuality}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-normal text-zinc-600">
                    Cargando condiciones actuales...
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => onOpenSpotForecast(selected.data)}
                    className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm py-2.5 rounded-xl transition-colors"
                  >
                    Ver pronóstico
                  </button>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.data.lat},${selected.data.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-4 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 font-medium text-sm py-2.5 rounded-xl border border-zinc-200 transition-colors"
                  >
                    <Navigation size={15} strokeWidth={1.75} className="text-zinc-600" />
                    Ir
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm font-normal text-zinc-600 leading-relaxed">
                  {selected.data.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {selected.data.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-normal px-2.5 py-0.5 rounded-md bg-zinc-50 text-zinc-600 border border-zinc-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 pt-0.5">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.data.lat},${selected.data.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm py-2.5 rounded-xl transition-colors"
                  >
                    <Navigation size={15} strokeWidth={1.75} />
                    Cómo llegar
                  </a>
                  {selected.data.instagram && (
                    <a
                      href={selected.data.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 inline-flex items-center justify-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 font-medium text-sm py-2.5 rounded-xl transition-colors"
                      aria-label="Instagram"
                    >
                      <ExternalLink size={15} strokeWidth={1.75} />
                    </a>
                  )}
                  {selected.data.whatsapp && (
                    <a
                      href={`https://wa.me/${selected.data.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 inline-flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-emerald-700 font-medium text-sm py-2.5 rounded-xl transition-colors"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
