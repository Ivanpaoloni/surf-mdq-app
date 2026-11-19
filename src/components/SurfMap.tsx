import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { calculateSurfRating, type SpotConfig } from '../services/surfRating';
import type { ForecastData } from '../services/openMeteo';
import { Star, Navigation, X, Waves, Bed, GraduationCap, Wrench, Layers } from 'lucide-react';

export interface PlaceItem {
  id: string;
  name: string;
  category: 'hostel' | 'school' | 'workshop';
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

const CATEGORY_META: Record<PlaceItem['category'], { label: string; color: string; short: string }> = {
  hostel: { label: 'Hostels', color: '#a855f7', short: 'H' },
  school: { label: 'Escuelas', color: '#06b6d4', short: 'E' },
  workshop: { label: 'Talleres', color: '#f97316', short: 'T' },
};

function getSpotPinColor(stars: number | null): string {
  if (stars === null) return '#475569';
  if (stars === 0) return '#64748b';
  if (stars <= 2) return '#f59e0b';
  return '#10b981';
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

    return () => {
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // 2. Cambiar entre mapa oscuro (OpenStreetMap) y Satélite (Esri) sin API Key
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
          html: `<div style="background:${bg};color:#0f172a;font-weight:800;font-size:11px;padding:3px 7px;border-radius:999px;border:2px solid #0f172a;box-shadow:0 2px 8px rgba(0,0,0,0.6);white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;">${label}</div>`,
          iconSize: [34, 24],
          iconAnchor: [17, 12],
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
        html: `<div style="background:${meta.color};color:#ffffff;font-weight:800;font-size:11px;width:24px;height:24px;border-radius:8px;border:2px solid #0f172a;box-shadow:0 2px 8px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;">${meta.short}</div>`,
        iconSize: [24, 24],
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
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-slate-950">
      {/* Chips flotantes de capas */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => toggleLayer('spots')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md shrink-0 transition-colors ${
            layers.spots
              ? 'bg-emerald-500/90 text-slate-950 border-emerald-400'
              : 'bg-slate-900/85 text-slate-400 border-slate-700'
          }`}
        >
          <Waves size={13} /> Olas
        </button>

        <button
          onClick={() => toggleLayer('hostel')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md shrink-0 transition-colors ${
            layers.hostel
              ? 'bg-purple-500/90 text-white border-purple-400'
              : 'bg-slate-900/85 text-slate-400 border-slate-700'
          }`}
        >
          <Bed size={13} /> Hostels
        </button>

        <button
          onClick={() => toggleLayer('school')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md shrink-0 transition-colors ${
            layers.school
              ? 'bg-cyan-500/90 text-slate-950 border-cyan-400'
              : 'bg-slate-900/85 text-slate-400 border-slate-700'
          }`}
        >
          <GraduationCap size={13} /> Escuelas
        </button>

        <button
          onClick={() => toggleLayer('workshop')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md shrink-0 transition-colors ${
            layers.workshop
              ? 'bg-orange-500/90 text-slate-950 border-orange-400'
              : 'bg-slate-900/85 text-slate-400 border-slate-700'
          }`}
        >
          <Wrench size={13} /> Talleres
        </button>
      </div>

      {/* Botón para alternar Mapa Oscuro / Satélite */}
      <button
        onClick={() => setMapStyle((prev) => (prev === 'dark' ? 'satellite' : 'dark'))}
        className="absolute top-14 right-3 z-[1000] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/90 text-white border border-slate-700 backdrop-blur-md shadow-lg"
      >
        <Layers size={14} className="text-sky-400" />
        {mapStyle === 'dark' ? 'Satélite' : 'Mapa'}
      </button>

      {/* Indicador sutil mientras carga el lote */}
      {loading && (
        <div className="absolute top-14 left-3 z-[1000] bg-slate-900/90 border border-slate-700 text-sky-400 text-xs px-3 py-1.5 rounded-full">
          Actualizando olas...
        </div>
      )}

      {/* Contenedor del mapa */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* Tarjeta inferior (Bottom Sheet) */}
      {selected && (
        <div className="absolute bottom-4 left-3 right-3 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] uppercase tracking-wider font-semibold text-sky-400">
                {selected.kind === 'spot'
                  ? selected.data.zone
                  : `${CATEGORY_META[selected.data.category].label} · ${selected.data.zone}`}
              </span>
              <h2 className="text-lg font-bold text-white leading-snug">
                {selected.data.name}
              </h2>
            </div>

            <button
              onClick={() => setSelected(null)}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          {selected.kind === 'spot' ? (
            <div className="mt-3 space-y-3">
              {selectedSpotCond && selectedSpotRating ? (
                <div className="grid grid-cols-3 gap-2 bg-slate-800/70 rounded-xl p-2.5 text-center">
                  <div>
                    <div className="text-[11px] text-slate-400">Ahora</div>
                    <div className="flex justify-center mt-1 text-amber-400">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          fill={i < selectedSpotRating.stars ? 'currentColor' : 'none'}
                          className={i < selectedSpotRating.stars ? '' : 'text-slate-600'}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Ola</div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {selectedSpotCond.waveHeight.toFixed(1)}m · {selectedSpotCond.wavePeriod.toFixed(0)}s
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Viento</div>
                    <div className="text-sm font-bold text-slate-200 mt-0.5 capitalize">
                      {selectedSpotCond.windSpeed.toFixed(0)} km/h
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Cargando condiciones actuales...</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => onOpenSpotForecast(selected.data)}
                  className="flex-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm py-2.5 rounded-xl transition-colors"
                >
                  Ver pronóstico
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.data.lat},${selected.data.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm py-2.5 rounded-xl border border-slate-700"
                >
                  <Navigation size={15} /> Ir
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">{selected.data.description}</p>

              <div className="flex flex-wrap gap-1.5">
                {selected.data.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.data.lat},${selected.data.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm py-2.5 rounded-xl"
                >
                  <Navigation size={15} /> Cómo llegar
                </a>
                {selected.data.whatsapp && (
                  <a
                    href={`https://wa.me/${selected.data.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 inline-flex items-center justify-center bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-xl"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}