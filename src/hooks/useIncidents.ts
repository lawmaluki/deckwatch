"use client";

import { useEffect, useState } from "react";
import { getIncidentsSnapshot, getReferenceTime } from "@/lib/incidents-source";
import type { Incident } from "@/lib/types";

// Must stay a literal process.env expression so Next inlines it at build time.
const USE_API = process.env.NEXT_PUBLIC_DATA_SOURCE === "api";

// Module-scoped so the components sharing this hook trigger one request, not
// one each.
let apiFetch: Promise<Incident[]> | null = null;

function fetchIncidentsOnce(): Promise<Incident[]> {
  apiFetch ??= fetch("/api/incidents")
    .then((res) => {
      if (!res.ok) throw new Error(`GET /api/incidents responded ${res.status}`);
      return res.json();
    })
    .then((body: { results: Incident[] }) => body.results);
  return apiFetch;
}

export interface IncidentsResult {
  incidents: Incident[];
  referenceTime: Date;
}

// Client adapter over the incidents-source seam. Both modes initialize from
// the deterministic mock snapshot so server and client renders match. With
// NEXT_PUBLIC_DATA_SOURCE=api the data is re-read from /api/incidents on
// mount — today that serves the identical dataset, so this proves the API
// contract end-to-end without changing what renders. Polling and
// loading/error state arrive with live data (Phase 3).
export function useIncidents(): IncidentsResult {
  const [incidents, setIncidents] = useState<Incident[]>(getIncidentsSnapshot);

  useEffect(() => {
    if (!USE_API) return;
    let cancelled = false;
    fetchIncidentsOnce()
      .then((data) => {
        if (!cancelled) setIncidents(data);
      })
      .catch(() => {
        // Keep the snapshot as fallback; surfacing errors is a live-data concern.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { incidents, referenceTime: getReferenceTime() };
}
