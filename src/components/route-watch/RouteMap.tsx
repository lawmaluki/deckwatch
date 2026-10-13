"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { CountyBoundaries } from "@/components/map/CountyBoundaries";
import { incidentDivIcon } from "@/components/map/markerIcons";
import type { LatLng, RouteMatch, RoutePlace } from "@/lib/route-watch";

const KENYA_BOUNDS: [[number, number], [number, number]] = [
  [-5.0, 33.0],
  [5.5, 42.5],
];

function endpointIcon(letter: string): L.DivIcon {
  return L.divIcon({
    className: "route-endpoint",
    html: `<div style="width:24px;height:24px;border-radius:9999px;background:var(--brand);color:#05070a;
      display:flex;align-items:center;justify-content:center;font:700 12px var(--font-sans,sans-serif);
      border:2px solid #05070a;box-shadow:0 0 0 2px var(--brand)">${letter}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/** Fits the route when it changes; the whole country before there is one. */
function FitRoute({ coords }: { coords: LatLng[] | null }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (coords && coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [32, 32], animate: true });
    } else {
      map.fitBounds(KENYA_BOUNDS, { animate: false });
    }
  }, [coords, map]);
  return null;
}

/** Keeps Leaflet's idea of its size in step with the container's. On a
 * phone the map is hidden until there is a route and can be enlarged, and
 * Leaflet only measures itself on window resize: without this it draws into
 * the size it had when it was hidden (zero) or before it grew. Coming out of
 * zero it also refits, since the fit made while hidden fitted nothing. */
function TrackSize({ coords }: { coords: LatLng[] | null }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let wasEmpty = el.clientWidth === 0 || el.clientHeight === 0;
    const observer = new ResizeObserver(() => {
      const empty = el.clientWidth === 0 || el.clientHeight === 0;
      if (empty) {
        wasEmpty = true;
        return;
      }
      map.invalidateSize();
      if (wasEmpty && coords && coords.length > 1) {
        map.fitBounds(L.latLngBounds(coords), { padding: [32, 32], animate: false });
      }
      wasEmpty = false;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map, coords]);
  return null;
}

/** Pans to the incident picked in the list, without changing the zoom the
 * reader chose. */
function PanToSelected({ match }: { match: RouteMatch | null }) {
  const map = useMap();
  useEffect(() => {
    if (match) map.panTo([match.incident.lat, match.incident.lng], { animate: true });
  }, [match, map]);
  return null;
}

export default function RouteMap({
  coords,
  from,
  to,
  matches,
  selectedId,
  onSelect,
}: {
  coords: LatLng[] | null;
  from: RoutePlace | null;
  to: RoutePlace | null;
  matches: RouteMatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const icons = useMemo(() => ({ a: endpointIcon("A"), b: endpointIcon("B") }), []);
  const selected = matches.find((m) => m.incident.id === selectedId) ?? null;

  return (
    <MapContainer
      center={[0.4, 37.9]}
      zoom={6}
      minZoom={5.5}
      maxZoom={17}
      zoomSnap={0}
      className="h-full w-full"
      preferCanvas
    >
      {/* No basemap, as on the live map: county outlines, the route and the
          incidents are all that's drawn. */}
      <CountyBoundaries interactive={false} />
      {coords && (
        <>
          {/* A wide faint band under the line reads as "the corridor" without
              claiming a width it doesn't draw to scale. */}
          <Polyline positions={coords} pathOptions={{ color: "#22c55e", weight: 14, opacity: 0.15 }} interactive={false} />
          <Polyline positions={coords} pathOptions={{ color: "#22c55e", weight: 4, opacity: 0.95 }} interactive={false} />
        </>
      )}
      {from && <Marker position={[from.lat, from.lng]} icon={icons.a} title={from.name} />}
      {to && <Marker position={[to.lat, to.lng]} icon={icons.b} title={to.name} />}
      {matches.map((m) => (
        <Marker
          key={m.incident.id}
          position={[m.incident.lat, m.incident.lng]}
          icon={incidentDivIcon(m.incident.severity)}
          title={m.incident.title}
          zIndexOffset={m.incident.id === selectedId ? 1000 : 0}
          opacity={selectedId && m.incident.id !== selectedId ? 0.55 : 1}
          eventHandlers={{ click: () => onSelect(m.incident.id) }}
        />
      ))}
      <FitRoute coords={coords} />
      <TrackSize coords={coords} />
      <PanToSelected match={selected} />
    </MapContainer>
  );
}
