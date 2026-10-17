"use client";

import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { useLanguage } from "@/components/language-provider";
import type { Language } from "@/lib/i18n";
import { BIN_TYPES, type BinType, type FillLevel, type RecyclingBin } from "@/lib/bins";

const TYPE_COLORS: Record<BinType, string> = { paper: "#4f78a8", plastic: "#b6952e", glass: "#4e7868" };
const FILL_COLORS: Record<FillLevel, string> = { empty: "#728b60", half: "#e9b95f", full: "#b95d3d" };
const ROUTE_BASE = "https://routing.openstreetmap.de/routed-foot";
type Position = [number, number];

export default function RecyclingMap({ bins, language, onReport, selectedBinId }: {
  bins: RecyclingBin[];
  language: Language;
  onReport: (id: string, fill: FillLevel) => void;
  selectedBinId: string | null;
}) {
  const { t } = useLanguage();
  const [userPosition, setUserPosition] = useState<Position | null>(null);
  const [routeType, setRouteType] = useState<BinType | null>(null);
  const [routePath, setRoutePath] = useState<Position[]>([]);
  const [routeMessage, setRouteMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const typeLabel = useMemo<Record<BinType, string>>(() => ({ paper: t("paper"), plastic: t("plastic"), glass: t("glass") }), [t]);
  const fillLabel = useMemo<Record<FillLevel, string>>(() => ({ empty: t("binEmpty"), half: t("binHalf"), full: t("binFull") }), [t]);
  const markerPositions = useMemo(() => spreadStationMarkers(bins), [bins]);

  function locate() {
    if (!navigator.geolocation) {
      setRouteMessage(t("binLocationUnsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserPosition([coords.latitude, coords.longitude]);
        setLocating(false);
      },
      (error) => {
        setRouteMessage(error.code === error.PERMISSION_DENIED ? t("binLocationDenied") : t("binLocationFailed"));
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 15_000 },
    );
  }

  function chooseRoute(type: BinType) {
    const next = routeType === type ? null : type;
    setRouteType(next);
    setRoutePath([]);
    setRouteMessage("");
    if (next && !userPosition) {
      setRouteMessage(t("binRouteFinding"));
      locate();
    }
  }

  function clearRoute() {
    setRouteType(null);
    setRoutePath([]);
    setRouteMessage("");
  }

  useEffect(() => {
    if (!routeType || !userPosition) return;
    const candidates = bins
      .filter((bin) => bin.type === routeType && bin.fill !== "full")
      .map((bin) => ({ bin, distance: distanceMeters(userPosition, [bin.lat, bin.lon]) }))
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length) {
      setRoutePath([]);
      setRouteMessage(t("binRouteNoAvailable"));
      return;
    }

    const best = candidates[0];
    const destination: Position = [best.bin.lat, best.bin.lon];
    setRoutePath([userPosition, destination]);
    setRouteMessage(`${typeLabel[routeType]} · ${formatDistance(best.distance, language)} ${t("binRouteDistance")}`);

    const controller = new AbortController();
    const url = `${ROUTE_BASE}/route/v1/driving/${userPosition[1]},${userPosition[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
        return response.json() as Promise<{ code?: string; routes?: Array<{ distance: number; duration: number; geometry: { coordinates: number[][] } }> }>;
      })
      .then((result) => {
        const route = result.routes?.[0];
        if (result.code !== "Ok" || !route?.geometry?.coordinates?.length) throw new Error("No walking route found");
        const points = route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as Position);
        setRoutePath(points);
        const minutes = Math.max(1, Math.round(route.duration / 60));
        setRouteMessage(`${typeLabel[routeType]} · ${formatDistance(route.distance, language)} · ${minutes} ${language === "mk" ? "мин. пешачење" : "min walk"} · ${best.bin.road}`);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setRouteMessage(`${typeLabel[routeType]} · ${formatDistance(best.distance, language)} · ${t("binRouteUnavailable")}`);
      });

    return () => controller.abort();
  }, [bins, language, routeType, userPosition, t, typeLabel]);

  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const routeBounds = useMemo(() => routePath.length > 1 ? routePath as LatLngBoundsExpression : undefined, [routePath]);

  return <div className="bin-map-shell" role="region" aria-label={language === "mk" ? "Мапа на канти за рециклирање во Скопје" : "Map of recycling bins in Skopje"}>
    <MapContainer center={[41.9981, 21.4254]} zoom={13} scrollWheelZoom className="leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' url={tileUrl} />
      {bins.map((bin) => <CircleMarker
        key={bin.id}
        center={markerPositions.get(bin.id) ?? [bin.lat, bin.lon]}
        radius={selectedBinId === bin.id ? 11 : 8}
        pathOptions={{ color: FILL_COLORS[bin.fill], weight: 3, fillColor: TYPE_COLORS[bin.type], fillOpacity: 0.95 }}
      >
        <Popup>
          <BinPopup bin={bin} language={language} typeLabel={typeLabel[bin.type]} fillLabel={fillLabel} onReport={onReport} />
        </Popup>
      </CircleMarker>)}
      {userPosition && <><Circle center={userPosition} radius={45} pathOptions={{ color: "#4f78a8", weight: 1, fillOpacity: 0.08, interactive: false }} /><CircleMarker center={userPosition} radius={7} pathOptions={{ color: "white", weight: 3, fillColor: "#4f78a8", fillOpacity: 1, interactive: false }} /></>}
      {routePath.length > 1 && <>
        <Polyline positions={routePath} pathOptions={{ color: "#fffefa", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
        <Polyline positions={routePath} pathOptions={{ color: "#255b45", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
      </>}
      <MapViewport bins={bins} selectedBinId={selectedBinId} routeBounds={routeBounds} />
    </MapContainer>

    <div className="bin-map-controls">
      <div className="bin-route-panel">
        <strong>{t("binRouteTo")}</strong>
        <div className="bin-route-types">
          {BIN_TYPES.map((type) => <button key={type} type="button" className={routeType === type ? "is-active" : ""} aria-pressed={routeType === type} onClick={() => chooseRoute(type)}>
            <i style={{ background: TYPE_COLORS[type] }} />{typeLabel[type]}
          </button>)}
        </div>
        <button type="button" className="bin-clear-route" onClick={clearRoute} disabled={!routeType && !routePath.length}>{t("binRouteClear")}</button>
        <div className="bin-route-message" role="status" aria-live="polite">{locating ? t("binRouteFinding") : routeMessage}</div>
      </div>
      <button type="button" className="bin-locate-button" onClick={locate} disabled={locating}>{locating ? t("binRouteFinding") : `⌖ ${t("binLocate")}`}</button>
    </div>

    <MapLegend language={language} typeLabel={typeLabel} fillLabel={fillLabel} />
  </div>;
}

function BinPopup({ bin, language, typeLabel, fillLabel, onReport }: {
  bin: RecyclingBin;
  language: Language;
  typeLabel: string;
  fillLabel: Record<FillLevel, string>;
  onReport: (id: string, fill: FillLevel) => void;
}) {
  const { t } = useLanguage();
  return <div className="bin-popup">
    <strong>{typeLabel}</strong>
    {bin.stationId && <span className="bin-popup-station">{language === "mk" ? "Пункт" : "Station"} {bin.stationId}</span>}
    <p className="bin-popup-road">{bin.road}</p>
    <p className="bin-popup-state"><i style={{ background: FILL_COLORS[bin.fill] }} />{fillLabel[bin.fill]} · {t("binUpdated")} {formatTimeAgo(Date.parse(bin.updatedAt), language)}</p>
    <span className="bin-popup-question">{t("binReportQuestion")}</span>
    <div className="bin-report-buttons">{(["empty", "half", "full"] as const).map((fill) => <button key={fill} type="button" className={bin.fill === fill ? "is-current" : ""} style={{ borderColor: FILL_COLORS[fill] }} onClick={() => onReport(bin.id, fill)}>{fillLabel[fill]}</button>)}</div>
    <small>{t("binReportSaved")}</small>
  </div>;
}

function MapLegend({ language, typeLabel, fillLabel }: {
  language: Language;
  typeLabel: Record<BinType, string>;
  fillLabel: Record<FillLevel, string>;
}) {
  return <div className="bin-map-legend">
    <strong>{language === "mk" ? "Материјал" : "Material"}</strong>
    {BIN_TYPES.map((type) => <span key={type}><i style={{ background: TYPE_COLORS[type] }} />{typeLabel[type]}</span>)}
    <strong>{language === "mk" ? "Исполнетост" : "Fill level"}</strong>
    {(["empty", "half", "full"] as const).map((fill) => <span key={fill}><i className="bin-legend-ring" style={{ borderColor: FILL_COLORS[fill] }} />{fillLabel[fill]}</span>)}
  </div>;
}

function MapViewport({ bins, selectedBinId, routeBounds }: {
  bins: RecyclingBin[];
  selectedBinId: string | null;
  routeBounds?: LatLngBoundsExpression;
}) {
  const map = useMap();
  useEffect(() => {
    if (routeBounds) map.fitBounds(routeBounds, { padding: [42, 42], maxZoom: 16 });
  }, [routeBounds, map]);
  useEffect(() => {
    if (selectedBinId) {
      const selected = bins.find((bin) => bin.id === selectedBinId);
      if (selected) map.flyTo([selected.lat, selected.lon], Math.max(map.getZoom(), 15), { duration: 0.5 });
    }
  }, [bins, map, selectedBinId]);
  useEffect(() => {
    if (!selectedBinId && !routeBounds && bins.length > 1) {
      const points = bins.map((bin) => [bin.lat, bin.lon] as LatLngExpression);
      map.fitBounds(points, { padding: [32, 32], maxZoom: 14 });
    } else if (!selectedBinId && !routeBounds && bins.length === 1) {
      map.setView([bins[0].lat, bins[0].lon], 14);
    }
  }, [bins, map, routeBounds, selectedBinId]);
  return null;
}

function spreadStationMarkers(bins: RecyclingBin[]) {
  const groups = new Map<string, RecyclingBin[]>();
  for (const bin of bins) {
    const key = bin.stationId ?? bin.id;
    groups.set(key, [...(groups.get(key) ?? []), bin]);
  }

  const positions = new Map<string, Position>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      positions.set(group[0].id, [group[0].lat, group[0].lon]);
      continue;
    }

    const centerLat = group.reduce((total, bin) => total + bin.lat, 0) / group.length;
    const centerLon = group.reduce((total, bin) => total + bin.lon, 0) / group.length;
    const radiusMeters = 18;
    group.forEach((bin, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / group.length;
      const lat = centerLat + Math.sin(angle) * radiusMeters / 111_320;
      const lon = centerLon + Math.cos(angle) * radiusMeters / (111_320 * Math.cos(centerLat * Math.PI / 180));
      positions.set(bin.id, [lat, lon]);
    });
  }
  return positions;
}

function distanceMeters([lat1, lon1]: Position, [lat2, lon2]: Position) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number, language: Language) {
  if (meters < 1000) return `${Math.round(meters)} ${language === "mk" ? "м" : "m"}`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatTimeAgo(timestamp: number, language: Language) {
  if (!Number.isFinite(timestamp)) return language === "mk" ? "без датум" : "unknown date";
  const mins = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (mins < 1) return language === "mk" ? "токму сега" : "just now";
  if (mins < 60) return language === "mk" ? `пред ${mins} мин.` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return language === "mk" ? `пред ${hours} ч.` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  return language === "mk" ? `пред ${days} д.` : `${days} d ago`;
}
