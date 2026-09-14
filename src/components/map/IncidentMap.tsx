"use client";

import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Incident } from "@/lib/types";
import { CountyBoundaries } from "@/components/map/CountyBoundaries";
import { ClusteredIncidentLayer } from "@/components/map/ClusteredIncidentLayer";
import { HeatmapLayer } from "@/components/map/HeatmapLayer";
import { useAppStore } from "@/store/useAppStore";
import { useIncidents } from "@/hooks/useIncidents";

const KENYA_CENTER: [number, number] = [0.4, 37.9];
const FLY_ZOOM = 11;
const FLY_DURATION_S = 1.1;

/** Width in px hidden behind panels docked over the map's right edge.
 *
 * Panels opt in with `data-map-occluder` rather than this hardcoding their
 * widths, so the answer stays right across breakpoints and however many are
 * open. Full-width elements (the mobile sheet, the mobile feed) are skipped:
 * they don't leave a narrower strip to aim at. */
function occludedRightPx(map: LeafletMap): number {
  const rect = map.getContainer().getBoundingClientRect();
  const midpoint = rect.left + rect.width / 2;
  let leftmost = rect.right;

  document.querySelectorAll<HTMLElement>("[data-map-occluder]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.left <= rect.left + 1) return;
    if (r.right <= midpoint) return;
    leftmost = Math.min(leftmost, r.left);
  });

  return Math.max(0, rect.right - leftmost);
}

function FlyToIncident() {
  const map = useMap();
  const selectedIncidentId = useAppStore((s) => s.selectedIncidentId);
  // The full set, not the map's filtered list: an incident opened from the
  // feed may be filtered off the map, and the fly has to work regardless.
  const { incidents } = useIncidents();
  const flownTo = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedIncidentId) {
      flownTo.current = null;
      return;
    }
    // Only a change of selection flies. `incidents` is a new array on every
    // poll, and without this the map would yank back to the open incident
    // every refresh, undoing whatever the reader had panned to.
    if (selectedIncidentId === flownTo.current) return;

    const incident = incidents.find((i) => i.id === selectedIncidentId);
    if (!incident) return;
    flownTo.current = selectedIncidentId;

    const zoom = Math.max(map.getZoom(), FLY_ZOOM);
    // Shift the centre by half the hidden strip so the incident settles in
    // the middle of the visible map rather than behind a panel.
    const target = map.unproject(
      map.project([incident.lat, incident.lng], zoom).add([occludedRightPx(map) / 2, 0]),
      zoom
    );
    map.flyTo(target, zoom, { duration: FLY_DURATION_S });
  }, [selectedIncidentId, incidents, map]);

  return null;
}

export default function IncidentMap({ incidents }: { incidents: Incident[] }) {
  const showHeatmap = useAppStore((s) => s.showHeatmap);

  return (
    <MapContainer
      center={KENYA_CENTER}
      zoom={6.3}
      minZoom={5.5}
      maxZoom={17}
      zoomControl={false}
      className="h-full w-full"
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png"
      />
      <CountyBoundaries />
      {showHeatmap ? (
        <HeatmapLayer incidents={incidents} />
      ) : (
        <ClusteredIncidentLayer incidents={incidents} />
      )}
      <FlyToIncident />
    </MapContainer>
  );
}
