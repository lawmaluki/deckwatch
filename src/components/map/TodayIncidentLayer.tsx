"use client";

import { useMemo, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { Incident } from "@/lib/types";
import { IncidentMarker } from "@/components/map/IncidentMarker";
import { DOT_SPACING_PX, groupByPoint, ringOffsets, TOUCH_DOT_SPACING_PX } from "@/lib/map-spread";

/** The "incidents today" view: every incident from the last 24 hours as its
 * own breathing dot. No clusters, so there are no per-area totals to read;
 * the point is where things happened today, at a glance. Dots sharing a point
 * (county-level reports sit on the county centre) are spread in a small ring,
 * re-laid at each zoom so the ring keeps its size on screen. */
export function TodayIncidentLayer({ incidents }: { incidents: Incident[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  // A narrow map is a phone: spread shared dots wider for fingers.
  const spacing = map.getSize().x < 640 ? TOUCH_DOT_SPACING_PX : DOT_SPACING_PX;

  const placed = useMemo(
    () =>
      groupByPoint(incidents).flatMap((group) => {
        const offsets = ringOffsets(group.length, spacing);
        const centre = map.project([group[0].lat, group[0].lng], zoom);
        return group.map((incident, i) => {
          if (group.length === 1) return { incident, position: undefined };
          const at = map.unproject(centre.add(offsets[i]), zoom);
          return { incident, position: [at.lat, at.lng] as [number, number] };
        });
      }),
    [incidents, map, zoom, spacing]
  );

  return (
    <>
      {placed.map(({ incident, position }) => (
        <IncidentMarker key={incident.id} incident={incident} position={position} pulse />
      ))}
    </>
  );
}
