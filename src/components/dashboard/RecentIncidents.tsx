"use client";

import { IncidentListItem } from "@/components/incidents/IncidentListItem";
import { useMapFocus } from "@/hooks/useMapFocus";
import type { Incident } from "@/lib/types";

export function RecentIncidents({ incidents }: { incidents: Incident[] }) {
  const focus = useMapFocus();

  return (
    <div className="space-y-1.5">
      {incidents.map((incident) => (
        <IncidentListItem
          key={incident.id}
          incident={incident}
          onClick={() => focus({ kind: "incident", value: incident.id })}
        />
      ))}
    </div>
  );
}
