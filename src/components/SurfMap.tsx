import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  calculateSurfRating,
  calculateWaveEnergyKj,
  type SpotConfig,
} from '../services/surfRating';
import type { ForecastData } from '../services/openMeteo';
import { getSwellDirectionQuality } from '../services/surfExtras';
import {
  degToCompass,
  getWindTextColor,
  getWindDotColor,
  getSwellQualityColor,
  getEnergySegmentColor,
} from '../utils/surfFormat';
import {
  Star,
  Navigation,
  X,
  Waves,
  Bed,
  GraduationCap,
  Wrench,
  Layers,
  ShoppingBag,
  ExternalLink,
  Globe,
  ArrowDown,
  Video,
} from 'lucide-react';

export type PlaceCity = 'Mar del Plata' | 'Chapadmalal' | 'Miramar';
export type PlaceCategory = 'hostel' | 'school' | 'shop' | 'workshop';

export interface PlaceItem {
  id: string;
  name: string;
  category: PlaceCategory;
  city: PlaceCity;
  zone: string;
  lat: number;
  lon: number;
  description: string;
  tags: string[];
  address?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  mapsUrl?: string;
}

interface FocusTarget {
  lat: number;
  lon: number;
  id?: string;
}

interface SurfMapProps {
  spots: SpotConfig[];
  spotsCurrent: Record<string, ForecastData>;
  places: PlaceItem[];
  loading: boolean;
  focusTarget: FocusTarget | null;
  onOpenSpotForecast: (spot: SpotConfig) => void;
}

type SelectedItem =
  | { kind: 'spot'; data: SpotConfig }
  | { kind: 'place'; data: PlaceItem }
  | null;

const CATEGORY_META: Record<
  PlaceCategory,
  { label: string; color: string; short: string }
> = {
  school: { label: 'Escuelas', color: '#0369a1', short: 'E' },
  hostel: { label: 'Hostels', color: '#7e22ce', short: 'H' },
  shop: { label: 'Surfshops', color: '#b45309', short: 'S' },
  workshop: { label: 'Talleres', color: '#c2410c', short: 'T' },
};

function getSpotPinColor(stars: number | null): string {
  if (stars === null) return '#52525b';
  if (stars === 0) return '#71717a';
  if (stars <= 2) return '#d97706';
  return '#059669';
}

function getPlaceMapsHref(place: PlaceItem): string {
  if (place.mapsUrl) return place.mapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.name} ${place.lat},${place.lon}`
  )}`;
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
  const focusTargetRef = useRef<FocusTarget | null>(focusTarget);

  const [userSelection, setUserSelection] = useState<{
    focus: FocusTarget | null;
    item: SelectedItem;
  } | null>(null);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');
  const [layers, setLayers] = useState({
    spots: true,
    school: true,
    hostel: true,
    shop: true,
    workshop: true,
  });

  const focusedPlace = focusTarget?.id
    ? places.find((p) => p.id === focusTarget.id)
    : undefined;

  const selected: SelectedItem =
    userSelection && userSelection.focus === focusTarget
      ? userSelection.item
      : focusedPlace
        ? { kind: 'place', data: focusedPlace }
        : null;

  const selectItem = (item: SelectedItem) => {
    setUserSelection({ focus: focusTargetRef.current, item });
  };

  // Mantener ref sincronizada para callbacks de Leaflet
  useEffect(() => {
    focusTargetRef.current = focusTarget;
  }, [focusTarget]);

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

    map.on('click', () => {
      setUserSelection({ focus: focusTargetRef.current, item: null });
    });

    const container = mapContainerRef.current;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.invalidateSize();
          })
        : null;
    resizeObserver?.observe(container);

    return () => {
      resizeObserver?.disconnect();
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
  }, [focusTarget]);

  // 4. Dibujar pines (lugares primero y spots con mayor prioridad visual / zIndexOffset)
  useEffect(() => {
    const layerGroup = markersLayerRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();

    places.forEach((place) => {
      if (!layers[place.category]) return;
      const meta = CATEGORY_META[place.category];

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:rgba(255,255,255,0.92);color:${meta.color};font-weight:600;font-size:10px;width:20px;height:20px;border-radius:6px;border:1.5px solid ${meta.color};box-shadow:0 1px 3px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">${meta.short}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker([place.lat, place.lon], { icon, zIndexOffset: 100 });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setUserSelection({
          focus: focusTargetRef.current,
          item: { kind: 'place', data: place },
        });
      });
      marker.addTo(layerGroup);
    });

    if (layers.spots) {
      spots.forEach((spot) => {
        const cond = spotsCurrent[spot.id];
        const rating = cond ? calculateSurfRating(cond, spot) : null;
        const bg = getSpotPinColor(rating ? rating.stars : null);
        const label = rating ? `${rating.stars}★` : '·';

        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${bg};color:#ffffff;font-weight:600;font-variant-numeric:tabular-nums;font-size:12px;padding:2px 8px;border-radius:999px;border:1.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.45);white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;">${label}</div>`,
          iconSize: [38, 24],
          iconAnchor: [19, 12],
        });

        const marker = L.marker([spot.lat, spot.lon], { icon, zIndexOffset: 500 });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setUserSelection({
            focus: focusTargetRef.current,
            item: { kind: 'spot', data: spot },
          });
        });
        marker.addTo(layerGroup);
      });
    }
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

  const selectedSpotSwell1 =
    selected?.kind === 'spot' && selectedSpotCond
      ? (selectedSpotCond.primarySwell ?? {
          height: selectedSpotCond.waveHeight,
          period: selectedSpotCond.wavePeriod,
          direction: selectedSpotCond.waveDirection,
        })
      : null;

  const selectedSpotSwellQuality =
    selected?.kind === 'spot' && selectedSpotSwell1
      ? getSwellDirectionQuality(selectedSpotSwell1.direction, selected.data.idealSwellDeg)
      : null;

  const selectedSpotEnergy = selectedSpotSwell1
    ? calculateWaveEnergyKj(selectedSpotSwell1.height, selectedSpotSwell1.period)
    : null;

  return (
    <div className="relative h-full w-full overflow-hidden isolate bg-zinc-100">
      {/* Controles superiores anclados dentro del marco */}
      <div className="absolute top-3 inset-x-3 z-500 pointer-events-none flex flex-col gap-2">
        {/* Chips flotantes de capas */}
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => toggleLayer('spots')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
              layers.spots
                ? 'bg-white/95 text-zinc-900 border-zinc-200 font-medium'
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
            type="button"
            onClick={() => toggleLayer('school')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
              layers.school
                ? 'bg-white/95 text-zinc-900 border-zinc-200 font-medium'
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
            type="button"
            onClick={() => toggleLayer('hostel')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
              layers.hostel
                ? 'bg-white/95 text-zinc-900 border-zinc-200 font-medium'
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
            type="button"
            onClick={() => toggleLayer('shop')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
              layers.shop
                ? 'bg-white/95 text-zinc-900 border-zinc-200 font-medium'
                : 'bg-white/80 text-zinc-500 border-zinc-200 font-normal'
            }`}
          >
            <ShoppingBag
              size={13}
              strokeWidth={1.75}
              className={layers.shop ? 'text-amber-700' : 'text-zinc-400'}
            />
            Surfshops
          </button>

          <button
            type="button"
            onClick={() => toggleLayer('workshop')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border backdrop-blur-sm shadow-sm shrink-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
              layers.workshop
                ? 'bg-white/95 text-zinc-900 border-zinc-200 font-medium'
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
        </div>

        {/* Indicador de carga y toggle Mapa Oscuro / Satélite */}
        <div className="flex items-center justify-between gap-2">
          {loading ? (
            <div className="pointer-events-auto bg-white/95 backdrop-blur-sm border border-zinc-200 shadow-sm text-zinc-900 text-xs font-medium px-3 py-1.5 rounded-xl">
              Actualizando olas...
            </div>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={() => setMapStyle((prev) => (prev === 'dark' ? 'satellite' : 'dark'))}
            className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/95 backdrop-blur-sm border border-zinc-200 shadow-sm text-zinc-900 hover:bg-zinc-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            <Layers size={14} strokeWidth={1.75} className="text-zinc-600" />
            {mapStyle === 'dark' ? 'Satélite' : 'Mapa'}
          </button>
        </div>
      </div>

      {/* Contenedor del mapa aislado para que los z-index internos de Leaflet no escapen */}
      <div ref={mapContainerRef} className="h-full w-full z-0 isolate" />

      {/* Card flotante inferior (anclada dentro del marco del mapa, con scroll interno si crece) */}
      {selected && (
        <div className="absolute bottom-3 inset-x-3 z-500 mx-auto max-w-2xl max-h-[45%] overflow-y-auto bg-white border border-zinc-200 rounded-2xl shadow-lg px-4 pt-3 pb-4">
          <div>
            <div className="w-9 h-1 rounded-full bg-zinc-200 mx-auto mb-3" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-normal text-zinc-500">
                  {selected.kind === 'spot'
                    ? selected.data.zone
                    : `${CATEGORY_META[selected.data.category].label} · ${selected.data.zone}${
                        selected.data.zone !== selected.data.city
                          ? ` · ${selected.data.city}`
                          : ''
                      }`}
                </p>
                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-0.5">
                  <h2 className="text-lg font-medium text-zinc-900 leading-snug">
                    {selected.data.name}
                  </h2>
                  {selected.kind === 'spot' && selectedSpotRating && (
                    <div
                      className="flex items-center gap-0.5"
                      aria-label={`${selectedSpotRating.stars} de 5 estrellas`}
                    >
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={14}
                          strokeWidth={1.75}
                          fill={i < selectedSpotRating.stars ? 'currentColor' : 'none'}
                          className={
                            i < selectedSpotRating.stars ? 'text-amber-500' : 'text-zinc-300'
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
                {selected.kind === 'place' && selected.data.address && (
                  <p className="text-xs font-normal text-zinc-500 mt-0.5">
                    {selected.data.address}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => selectItem(null)}
                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                aria-label="Cerrar"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            {selected.kind === 'spot' ? (
              <div className="mt-3.5 space-y-3.5">
                {selectedSpotCond &&
                selectedSpotRating &&
                selectedSpotSwell1 &&
                selectedSpotSwellQuality &&
                selectedSpotEnergy ? (
                  <div className="grid grid-cols-3 gap-2 tabular-nums">
                    {/* 1. Swell 1 (sin rango) */}
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-2.5 flex flex-col justify-between gap-1">
                      <div className="text-[11px] font-normal text-zinc-500">Swell 1</div>
                      <div>
                        <div className="text-xl font-semibold text-zinc-900 leading-tight whitespace-nowrap">
                          {selectedSpotSwell1.height.toFixed(1)}
                          <span className="text-sm font-normal text-zinc-500 ml-0.5">m</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-normal text-zinc-600 mt-1 flex-wrap">
                          <span>{Math.round(selectedSpotSwell1.period)}s</span>
                          <span className="text-zinc-300">·</span>
                          <ArrowDown
                            size={12}
                            strokeWidth={2}
                            className={getSwellQualityColor(selectedSpotSwellQuality)}
                            style={{ transform: `rotate(${selectedSpotSwell1.direction}deg)` }}
                          />
                          <span>{degToCompass(selectedSpotSwell1.direction)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 2. Viento */}
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-2.5 flex flex-col justify-between gap-1">
                      <div className="text-[11px] font-normal text-zinc-500">Viento</div>
                      <div>
                        <div className="flex items-center gap-1.5 text-base font-medium text-zinc-900 leading-tight whitespace-nowrap">
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full shrink-0 ${getWindDotColor(selectedSpotRating.windQuality)}`}
                          />
                          <span>
                            {Math.round(selectedSpotCond.windSpeed)}{' '}
                            <span className="text-xs font-normal text-zinc-500">km/h</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-x-1 gap-y-0.5 text-xs font-normal mt-1 flex-wrap">
                          <ArrowDown
                            size={12}
                            strokeWidth={1.75}
                            className={getWindTextColor(selectedSpotRating.windQuality)}
                            style={{ transform: `rotate(${selectedSpotCond.windDirection}deg)` }}
                          />
                          <span className="text-zinc-600">
                            {degToCompass(selectedSpotCond.windDirection)}
                          </span>
                          <span
                            className={`capitalize ${getWindTextColor(selectedSpotRating.windQuality)}`}
                          >
                            {selectedSpotRating.windQuality}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3. Energía */}
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-2.5 flex flex-col justify-between gap-1">
                      <div className="text-[11px] font-normal text-zinc-500">Energía</div>
                      <div>
                        <div className="text-base font-medium text-zinc-900 leading-tight whitespace-nowrap">
                          {selectedSpotEnergy.kj}{' '}
                          <span className="text-xs font-normal text-zinc-500">kJ</span>
                        </div>
                        <div className="text-xs font-normal text-zinc-600 capitalize mt-0.5">
                          {selectedSpotEnergy.label}
                        </div>
                        <div
                          aria-label={`Energía ${selectedSpotEnergy.label}`}
                          className="flex gap-1 mt-1.5"
                        >
                          {[1, 2, 3, 4].map((seg) => (
                            <span
                              key={seg}
                              className={`h-1 flex-1 rounded-full ${
                                seg <= selectedSpotEnergy.level
                                  ? getEnergySegmentColor(selectedSpotEnergy.level)
                                  : 'bg-zinc-200'
                              }`}
                            />
                          ))}
                        </div>
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
                    type="button"
                    onClick={() => onOpenSpotForecast(selected.data)}
                    className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm py-2.5 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  >
                    Ver pronóstico
                  </button>

                  {selected.data.camUrl && (
                    <a
                      href={selected.data.camUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 bg-white hover:bg-zinc-50 text-zinc-800 font-medium text-sm py-2.5 rounded-xl border border-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                    >
                      <Video size={15} strokeWidth={1.75} className="text-zinc-600" />
                      Cámara
                    </a>
                  )}

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.data.lat},${selected.data.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 bg-white hover:bg-zinc-50 text-zinc-800 font-medium text-sm py-2.5 rounded-xl border border-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
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

                <div className="flex flex-wrap gap-2 pt-0.5">
                  <a
                    href={getPlaceMapsHref(selected.data)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm py-2.5 px-3 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  >
                    <Navigation size={15} strokeWidth={1.75} />
                    Ver en Maps
                  </a>
                  {selected.data.website && (
                    <a
                      href={selected.data.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 inline-flex items-center justify-center gap-1.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 font-medium text-sm py-2.5 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                    >
                      <Globe size={15} strokeWidth={1.75} className="text-zinc-600" />
                      Web
                    </a>
                  )}
                  {selected.data.instagram && (
                    <a
                      href={selected.data.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 inline-flex items-center justify-center gap-1.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 font-medium text-sm py-2.5 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                      aria-label="Instagram"
                    >
                      <ExternalLink size={15} strokeWidth={1.75} className="text-zinc-600" />
                      IG
                    </a>
                  )}
                  {selected.data.whatsapp && (
                    <a
                      href={`https://wa.me/${selected.data.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 inline-flex items-center justify-center bg-white hover:bg-zinc-50 border border-zinc-200 text-emerald-700 font-medium text-sm py-2.5 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
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
