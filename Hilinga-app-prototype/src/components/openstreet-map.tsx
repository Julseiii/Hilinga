import "leaflet/dist/leaflet.css";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

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
};

const LEGAZPI = { latitude: 13.1333, longitude: 123.7333 };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function OpenStreetMap({ places, routeStops = [], selectedId, onSelect, liveLocation = null, startPoint = null, destination = null, routeGeometry = [], onMapPress }: OpenStreetMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      const L = await import("leaflet");
      const host = hostRef.current;
      if (!host || cancelled || mapRef.current) return;

      const map = L.map(host, { zoomControl: true }).setView([LEGAZPI.latitude, LEGAZPI.longitude], 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 19,
      }).addTo(map);

      if (onMapPress) {
        map.on("click", ({ latlng, originalEvent }) => {
          const target = originalEvent.target;
          if (target instanceof Element && target.closest(".leaflet-interactive, .leaflet-control")) return;
          onMapPress({
            id: "dropped-pin",
            name: "Dropped pin",
            subtitle: `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`,
            latitude: latlng.lat,
            longitude: latlng.lng,
          });
        });
      }

      L.circleMarker([LEGAZPI.latitude, LEGAZPI.longitude], {
        color: "#FFFFFF",
        fillColor: "#007A50",
        fillOpacity: 1,
        radius: 8,
        weight: 3,
      }).bindPopup("<strong>Legazpi City</strong><br>Default map location").addTo(map);

      if (liveLocation) {
        L.circle([liveLocation.latitude, liveLocation.longitude], {
          color: "#2563EB",
          fillColor: "#60A5FA",
          fillOpacity: 0.12,
          radius: liveLocation.accuracy,
          weight: 1,
        }).addTo(map);
        L.circleMarker([liveLocation.latitude, liveLocation.longitude], {
          color: "#FFFFFF",
          fillColor: "#2563EB",
          fillOpacity: 1,
          radius: 9,
          weight: 4,
        }).bindPopup(`<strong>Your live location</strong><br>Accurate to about ${Math.round(liveLocation.accuracy)} m`).addTo(map);
      }

      if (startPoint) {
        L.circleMarker([startPoint.latitude, startPoint.longitude], {
          color: "#FFFFFF",
          fillColor: "#007A50",
          fillOpacity: 1,
          radius: 10,
          weight: 3,
        }).bindPopup(`<strong>Start: ${escapeHtml(startPoint.name)}</strong><br>${escapeHtml(startPoint.subtitle)}`).addTo(map);
      }

      if (destination) {
        L.circleMarker([destination.latitude, destination.longitude], {
          color: "#FFFFFF",
          fillColor: "#B42318",
          fillOpacity: 1,
          radius: 10,
          weight: 3,
        }).bindPopup(`<strong>Destination: ${escapeHtml(destination.name)}</strong><br>${escapeHtml(destination.subtitle)}`).addTo(map);
      }

      if (startPoint && destination) {
        const pointToPointBounds = L.latLngBounds([
          [startPoint.latitude, startPoint.longitude],
          [destination.latitude, destination.longitude],
        ]);
        const path = routeGeometry.length > 1
          ? [...routeGeometry]
          : [[startPoint.latitude, startPoint.longitude], [destination.latitude, destination.longitude]] as [number, number][];
        L.polyline(path, {
          color: "#007A50",
          weight: 6,
          opacity: 0.88,
          dashArray: routeGeometry.length > 1 ? undefined : "10 8",
        }).bindTooltip(routeGeometry.length > 1 ? "Road route" : "Estimated direct route").addTo(map);
        map.fitBounds(pointToPointBounds, { padding: [42, 42], maxZoom: 14 });
      } else if (liveLocation) {
        map.setView([liveLocation.latitude, liveLocation.longitude], 16);
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

      if (routeStops.length > 0 && !(startPoint && destination)) {
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
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [34, 34], maxZoom: 14 });
      }

      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
    }

    initializeMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [destination, liveLocation, onMapPress, onSelect, places, routeGeometry, routeStops, startPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const selected = places.find((place) => place.id === selectedId);
    map.flyTo(
      selected ? [selected.latitude, selected.longitude] : [LEGAZPI.latitude, LEGAZPI.longitude],
      selected ? 14 : 12,
      { duration: 0.5 },
    );
  }, [places, selectedId]);

  return (
    <div className="map-container">
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      {onMapPress && <div className="map-tap-hint">Tap anywhere to route there</div>}
    </div>
  );
}
