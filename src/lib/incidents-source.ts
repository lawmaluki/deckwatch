import { MOCK_INCIDENTS, DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import type { Incident } from "@/lib/types";

// Single seam for incident data. Everything outside this module (and the
// tests that exercise the mock generator itself) must read incidents through
// getIncidents() (server) or useIncidents() (client). Phase 2 of the live-data
// migration swaps these bodies for fetch()/API calls without touching callers.

export async function getIncidents(): Promise<Incident[]> {
  return MOCK_INCIDENTS;
}

// Synchronous snapshot for the client path (useIncidents only).
export function getIncidentsSnapshot(): Incident[] {
  return MOCK_INCIDENTS;
}

// Centralized clock: fixed while on mock data so SSR/client renders match;
// becomes the live "now" once real data lands (Phase 3).
export function getReferenceTime(): Date {
  return DATA_REFERENCE_TIME;
}
