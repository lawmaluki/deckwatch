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

// A panel has to leave at least this much of the map to be worth aiming at.
// Anything covering more (the full-screen mobile feed) is ignored: there is no
// strip left to centre an incident in, and offsetting would fling it off-map.
const MIN_VISIBLE_FRACTION = 0.2;

/** Pixels of map hidden behind docked panels, per edge.
 *
 * Panels opt in with `data-map-occluder` rather than this hardcoding their
 * widths, so the answer holds across breakpoints and however many are open.
 * Side panels cost width; the mobile sheet costs height. */
function occlusion(map: LeafletMap): { right: number; bottom: number } {
  const rect = map.getContainer().getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  let leftmost = rect.right;
  let topmost = rect.bottom;

  document.querySelectorAll<HTMLElement>("[data-map-occluder]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    if (r.right > midX && r.left > rect.left + rect.width * MIN_VISIBLE_FRACTION) {
      leftmost = Math.min(leftmost, r.left);
    } else if (r.bottom > midY && r.top > rect.top + rect.height * MIN_VISIBLE_FRACTION) {
      topmost = Math.min(topmost, r.top);
    }
  });

  return {
    right: Math.max(0, rect.right - leftmost),
    bottom: Math.max(0, rect.bottom - topmost),
  };
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
    // Shift the centre by half of each hidden strip so the incident settles in
    // the middle of the visible map rather than behind a panel — sideways for
    // the desktop panels, upward for the mobile sheet.
    const hidden = occlusion(map);
    const target = map.unproject(
      map
        .project([incident.lat, incident.lng], zoom)
        .add([hidden.right / 2, hidden.bottom / 2]),
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
