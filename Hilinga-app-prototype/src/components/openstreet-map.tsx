import "leaflet/dist/leaflet.css";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";
import type { RegisteredSmallBusiness } from "@/lib/business-content";

export type MapPlace = {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

export type MapTerminal = MapPlace & {
  transport: string;
};

export type MapRouteStop = MapPlace & {
  day: number;
  order: number;
  time: string;
  travelMinutes: number;
  travelDistanceKm: number;
  terminal: MapTerminal;
  directions: string;
};

type OpenStreetMapProps = {
  places: readonly MapPlace[];
  routeStops?: readonly MapRouteStop[];
  selectedId: string;
  onSelect: (id: string) => void;
  liveLocation?: (MapPlace & { accuracy: number }) | null;
  startPoint?: MapPlace | null;
  destination?: MapPlace | null;
  routeGeometry?: readonly [number, number][];
  onMapPress?: (place: MapPlace) => void;
  registeredBusinesses?: readonly RegisteredSmallBusiness[];
  showTransportRoutes?: boolean;
  showRegisteredBusinesses?: boolean;
};

const LEGAZPI = { latitude: 13.1333, longitude: 123.7333 };

export const ALBAY_TRANSPORT_TERMINALS: MapTerminal[] = [
  { id: "terminal-legazpi", name: "Ibalong Grand Central Terminal", subtitle: "Main Legazpi bus, UV & jeepney hub", latitude: 13.1437, longitude: 123.7435, transport: "Jeepney, UV Express, Bus, Tricycle" },
  { id: "terminal-daraga", name: "Daraga Public Market Terminal", subtitle: "Daraga jeepney & tricycle hub", latitude: 13.1470, longitude: 123.7117, transport: "Daraga Jeepney, Tricycle" },
  { id: "terminal-camalig", name: "Camalig Town Transport Hub", subtitle: "West Albay jeepney stop", latitude: 13.1481, longitude: 123.6602, transport: "Jeepney, Tricycle" },
  { id: "terminal-guinobatan", name: "Guinobatan Central Stop", subtitle: "Guinobatan highway stop", latitude: 13.1903, longitude: 123.6010, transport: "Jeepney, Bus, UV Express" },
  { id: "terminal-ligao", name: "Ligao City Transport Terminal", subtitle: "West Albay central terminal", latitude: 13.2411, longitude: 123.5358, transport: "UV Express, Jeepney, Bus" },
  { id: "terminal-tabaco", name: "Tabaco City Central Terminal", subtitle: "North Albay bus, UV & ferry hub", latitude: 13.3590, longitude: 123.7300, transport: "UV Express, Jeepney, Bus, Ferry" },
  { id: "terminal-bacacay", name: "Bacacay Town Transport Stop", subtitle: "East coast jeepney terminal", latitude: 13.2927, longitude: 123.7914, transport: "Jeepney, Tricycle, Boat" },
];

export const ALBAY_TRANSPORT_ROUTES = [
  {
    name: "Legazpi – Daraga Jeepney Route",
    type: "Jeepney",
    color: "#F59E0B",
    path: [
      [13.1437, 123.7435],
      [13.1391, 123.7438],
      [13.1417, 123.7150],
      [13.1470, 123.7117],
    ] as [number, number][],
  },
  {
    name: "West Albay Route (Legazpi – Camalig – Ligao)",
    type: "Bus / Jeepney / UV Express",
    color: "#3B82F6",
    path: [
      [13.1437, 123.7435],
      [13.1470, 123.7117],
      [13.1481, 123.6602],
      [13.1903, 123.6010],
      [13.2411, 123.5358],
    ] as [number, number][],
  },
  {
    name: "North Albay Route (Legazpi – Sto. Domingo – Tabaco)",
    type: "UV Express / Bus",
    color: "#8B5CF6",
    path: [
      [13.1437, 123.7435],
      [13.2356, 123.7744],
      [13.3150, 123.7380],
      [13.3590, 123.7300],
    ] as [number, number][],
  },
  {
    name: "Tabaco – Bacacay Coastal Route",
    type: "Jeepney",
    color: "#10B981",
    path: [
      [13.3590, 123.7300],
      [13.2927, 123.7914],
    ] as [number, number][],
  },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function OpenStreetMap({
  places,
  routeStops = [],
  selectedId,
  onSelect,
  liveLocation = null,
  startPoint = null,
  destination = null,
  routeGeometry = [],
  onMapPress,
  registeredBusinesses = [],
  showTransportRoutes = true,
  showRegisteredBusinesses = true,
}: OpenStreetMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let active = true;
    async function setupMap() {
      const container = hostRef.current;
      if (!container) return;
      const L = await import("leaflet");
      if (!active) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const center: [number, number] = liveLocation
        ? [liveLocation.latitude, liveLocation.longitude]
        : startPoint
          ? [startPoint.latitude, startPoint.longitude]
          : destination
            ? [destination.latitude, destination.longitude]
            : [LEGAZPI.latitude, LEGAZPI.longitude];

      const map = L.map(container, { zoomControl: false }).setView(center, 12);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      if (onMapPress) {
        map.on("click", (event) => {
          const { lat, lng } = event.latlng;
          onMapPress({
            id: `pin-${Date.now()}`,
            name: "Selected location",
            subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            latitude: lat,
            longitude: lng,
          });
        });
      }

      // ── Transportation Routes & Hub Terminals ──
      if (showTransportRoutes) {
        ALBAY_TRANSPORT_ROUTES.forEach((route) => {
          L.polyline(route.path, {
            color: route.color,
            weight: 4,
            opacity: 0.75,
            dashArray: "8 6",
          }).bindTooltip(`${escapeHtml(route.name)} (${escapeHtml(route.type)})`, { permanent: false, direction: "top" }).addTo(map);
        });

        ALBAY_TRANSPORT_TERMINALS.forEach((terminal) => {
          const marker = L.circleMarker([terminal.latitude, terminal.longitude], {
            color: "#FFFFFF",
            fillColor: "#D97706",
            fillOpacity: 1,
            radius: 9,
            weight: 3,
          });
          marker.bindPopup(`<strong>🚌 ${escapeHtml(terminal.name)}</strong><br/><span style="color:#D97706;font-weight:800;font-size:11px;">Transport Hub</span><br/><strong>Vehicles:</strong> ${escapeHtml(terminal.transport)}<br/>${escapeHtml(terminal.subtitle)}`);
          marker.addTo(map);
        });
      }

      // ── Registered Small Businesses Layer ──
      if (showRegisteredBusinesses && registeredBusinesses.length > 0) {
        registeredBusinesses.forEach((biz) => {
          const marker = L.circleMarker([biz.latitude, biz.longitude], {
            color: "#FFFFFF",
            fillColor: "#00A86B",
            fillOpacity: 1,
            radius: 10,
            weight: 3,
          });
          marker.bindTooltip(`🏪 ${escapeHtml(biz.name)}`, { permanent: false, direction: "top" });
          marker.bindPopup(`
            <div style="min-width: 170px; display: flex; flex-direction: column; gap: 3px;">
              <span style="color:#00A86B; font-weight:800; font-size:11px; letter-spacing:0.3px;">✓ REGISTERED LOCAL BUSINESS</span>
              <strong style="font-size:14px; color:#101828;">${escapeHtml(biz.name)}</strong>
              <span style="font-size:12px; color:#475467;">${escapeHtml(biz.category)} • ${escapeHtml(biz.location)}</span>
              <div style="margin-top:4px; font-size:11px; color:#344054; line-height:1.4;">${escapeHtml(biz.about)}</div>
              <div style="margin-top:4px; font-size:10px; color:#00A86B; font-weight:800;">Hours: ${escapeHtml(biz.hours)}</div>
            </div>
          `);
          marker.addTo(map);
        });
      }

      if (liveLocation) {
        L.circleMarker([liveLocation.latitude, liveLocation.longitude], {
          color: "#FFFFFF",
          fillColor: "#007A50",
          fillOpacity: 1,
          radius: 9,
          weight: 3,
        }).bindPopup("<strong>Your live location</strong><br>Updating as you move").addTo(map);
        L.circle([liveLocation.latitude, liveLocation.longitude], {
          radius: liveLocation.accuracy,
          color: "#007A50",
          weight: 1,
          fillColor: "#007A50",
          fillOpacity: 0.12,
        }).addTo(map);
      }

      if (startPoint) {
        L.circleMarker([startPoint.latitude, startPoint.longitude], {
          color: "#FFFFFF",
          fillColor: "#0F766E",
          fillOpacity: 1,
          radius: 9,
          weight: 3,
        }).bindPopup(`<strong>Start: ${escapeHtml(startPoint.name)}</strong><br>${escapeHtml(startPoint.subtitle)}`).addTo(map);
      }

      if (destination) {
        L.circleMarker([destination.latitude, destination.longitude], {
          color: "#FFFFFF",
          fillColor: "#B42318",
          fillOpacity: 1,
          radius: 9,
          weight: 3,
        }).bindPopup(`<strong>Destination: ${escapeHtml(destination.name)}</strong><br>${escapeHtml(destination.subtitle)}`).addTo(map);
      }

      if (startPoint && destination) {
        const bounds = L.latLngBounds([
          [startPoint.latitude, startPoint.longitude],
          [destination.latitude, destination.longitude],
        ]);
        const path = routeGeometry.length > 0 ? [...routeGeometry] : [[startPoint.latitude, startPoint.longitude], [destination.latitude, destination.longitude]] as [number, number][];
        L.polyline(path, { color: "#007A50", weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(bounds, { padding: [50, 50] });
      }

      const routeStopIds = new Set(routeStops.map((stop) => stop.id));
      places.filter((place) => !routeStopIds.has(place.id)).forEach((place) => {
        const marker = L.circleMarker([place.latitude, place.longitude], {
          color: "#FFFFFF",
          fillColor: "#B42318",
          fillOpacity: 1,
          radius: 8,
          weight: 3,
        });
        marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.subtitle)}`);
        marker.on("click", () => onSelect(place.id));
        marker.addTo(map);
      });

      if (routeStops.length > 0) {
        const terminals = new Map(routeStops.map((stop) => [stop.terminal.id, stop.terminal]));
        terminals.forEach((terminal) => {
          L.circleMarker([terminal.latitude, terminal.longitude], {
            color: "#FFFFFF",
            fillColor: "#D97706",
            fillOpacity: 1,
            radius: 9,
            weight: 3,
          }).bindPopup(`<strong>${escapeHtml(terminal.name)}</strong><br>${escapeHtml(terminal.transport)} boarding point`).addTo(map);
        });

        routeStops.forEach((stop, index) => {
          const marker = L.circleMarker([stop.latitude, stop.longitude], {
            color: "#FFFFFF",
            fillColor: "#146C94",
            fillOpacity: 1,
            radius: 10,
            weight: 3,
          });
          marker.bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "route-number-tooltip" });
          marker.bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.directions)}<br>About ${stop.travelMinutes} min`);
          marker.on("click", () => onSelect(stop.id));
          marker.addTo(map);
        });

        const routePoints = routeStops.map((stop) => [stop.latitude, stop.longitude] as [number, number]);
        if (routePoints.length > 1) L.polyline(routePoints, { color: "#146C94", weight: 5, opacity: 0.82 }).addTo(map);
        routeStops.forEach((stop) => {
          L.polyline([
            [stop.terminal.latitude, stop.terminal.longitude],
            [stop.latitude, stop.longitude],
          ], { color: "#D97706", weight: 3, opacity: 0.72, dashArray: "7 7" }).addTo(map);
        });
        const boundsPoints = routeStops.flatMap((stop) => [
          [stop.terminal.latitude, stop.terminal.longitude] as [number, number],
          [stop.latitude, stop.longitude] as [number, number],
        ]);
        if (startPoint) boundsPoints.push([startPoint.latitude, startPoint.longitude]);
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [34, 34], maxZoom: 14 });
      }

      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
    }

    void setupMap();
    return () => {
      active = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [places, routeStops, liveLocation, startPoint, destination, routeGeometry, onSelect, onMapPress, registeredBusinesses, showTransportRoutes, showRegisteredBusinesses]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const target = routeStops.find((stop) => stop.id === selectedId) ?? places.find((place) => place.id === selectedId);
    if (target) map.flyTo([target.latitude, target.longitude], 15, { duration: 0.8 });
  }, [selectedId, places, routeStops]);

  return (
    <div className="leaflet-map-container">
      <div ref={hostRef} className="leaflet-map" aria-label="OpenStreetMap interactive map view" />
      {onMapPress && <div className="map-tap-hint">Tap map to drop pin</div>}
    </div>
  );
}
