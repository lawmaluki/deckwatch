"use client";

import { Marker, Tooltip } from "react-leaflet";
import type { Incident } from "@/lib/types";
import { CATEGORIES } from "@/lib/data/categories";
import { incidentDivIcon } from "@/components/map/markerIcons";
import { useAppStore } from "@/store/useAppStore";

/** One incident on the live map: severity-coloured dot, hover card, and a
 * click (or Enter/Space) that opens it. Shared by the clustered layer and the
 * today layer so the two can't drift apart. `position` defaults to the
 * incident's own point; the today layer passes a nudged one when several
 * share a point. */
export function IncidentMarker({
  incident,
  position,
  pulse,
}: {
  incident: Incident;
  position?: [number, number];
  pulse?: boolean;
}) {
  const selectIncident = useAppStore((s) => s.selectIncident);
  const category = CATEGORIES[incident.category];

  return (
    <Marker
      position={position ?? [incident.lat, incident.lng]}
      icon={incidentDivIcon(incident.severity, { pulse })}
      alt={`${category.label}, ${incident.severity} severity, ${incident.county} County: ${incident.title}`}
      eventHandlers={{
        click: () => selectIncident(incident.id),
        // Leaflet focuses markers but only forwards clicks; without
        // this a keyboard user can reach a marker and not open it.
        keypress: (e) => {
          const key = (e.originalEvent as KeyboardEvent).key;
          if (key === "Enter" || key === " ") selectIncident(incident.id);
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -10]} opacity={1} className="incident-tooltip">
        <p className="text-xs font-bold leading-snug" style={{ color: category.color }}>
          {category.label}
        </p>
        <p className="text-xs leading-snug text-white/90">{incident.title}</p>
        <p className="mt-1 text-[10px] leading-snug text-white/50">{incident.reportedAt.slice(0, 10)}</p>
      </Tooltip>
    </Marker>
  );
}
