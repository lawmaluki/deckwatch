"use client";

import { getIncidentsSnapshot, getReferenceTime } from "@/lib/incidents-source";
import type { Incident } from "@/lib/types";

export interface IncidentsResult {
  incidents: Incident[];
  referenceTime: Date;
}

// Client adapter over the incidents-source seam. Today this is a synchronous
// read of the deterministic mock snapshot — identical on server and client
// renders, so no loading state or hydration risk. When live data lands this
// body becomes fetch + polling behind the same return shape (isLoading/error
// fields can be added without breaking destructuring consumers).
export function useIncidents(): IncidentsResult {
  return {
    incidents: getIncidentsSnapshot(),
    referenceTime: getReferenceTime(),
  };
}
