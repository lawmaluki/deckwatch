import { MOCK_INCIDENTS, DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import type { Incident } from "@/lib/types";

// Single seam for incident data. Everything outside this module (and the
// tests that exercise the mock generator itself) must read incidents through
// getIncidents() (server), useIncidents() (client), or getLiveIncidents()
// (route handlers). A real backend replaces the bodies here without touching
// callers.

// Literal expression so Next inlines it into the client bundle; plain env
// read on the server.
export const USE_API = process.env.NEXT_PUBLIC_DATA_SOURCE === "api";

const IS_SERVER = typeof window === "undefined";

export interface DataSnapshot {
  incidents: Incident[];
  referenceTime: Date;
}

// Pure: re-anchor the seeded dataset so its newest activity sits at nowMs.
// Data and clock shift by the same delta, so every duration-derived value
// (hoursAgo, withinHours counts, relativeTime strings, trend buckets) is
// exactly equal to mock mode's — the anchor cancels out.
export function shiftIncidents(incidents: Incident[], nowMs: number): Incident[] {
  const delta = nowMs - DATA_REFERENCE_TIME.getTime();
  return incidents.map((i) => ({
    ...i,
    reportedAt: new Date(Date.parse(i.reportedAt) + delta).toISOString(),
  }));
}

// Always-live read for the route handlers: the API simulates a live feed in
// every mode, anchored to the caller's request time.
export function getLiveIncidents(nowMs: number): Incident[] {
  return shiftIncidents(MOCK_INCIDENTS, nowMs);
}

const MOCK_SNAPSHOT: DataSnapshot = {
  incidents: MOCK_INCIDENTS,
  referenceTime: DATA_REFERENCE_TIME,
};

function liveSnapshot(nowMs: number): DataSnapshot {
  return { incidents: getLiveIncidents(nowMs), referenceTime: new Date(nowMs) };
}

// Client (api mode): the one mutable snapshot. Seeded from the page-load
// anchor; advanced atomically by the useIncidents poll. Keeping incidents
// and referenceTime in one object keeps global-clock readers (stats/format)
// coherent with polled data.
let clientSnapshot: DataSnapshot | null = null;

export function getDataSnapshot(): DataSnapshot {
  if (!USE_API) return MOCK_SNAPSHOT;
  if (IS_SERVER) return liveSnapshot(Date.now());
  clientSnapshot ??= liveSnapshot(Date.now());
  return clientSnapshot;
}

// Called only by the useIncidents poll (client, api mode).
export function replaceClientSnapshot(next: DataSnapshot): void {
  clientSnapshot = next;
}

export async function getIncidents(): Promise<Incident[]> {
  return getDataSnapshot().incidents;
}

// Synchronous snapshot for the client path (useIncidents only).
export function getIncidentsSnapshot(): Incident[] {
  return getDataSnapshot().incidents;
}

// Centralized clock: fixed while on mock data so SSR/client renders match;
// live (paired with shifted data) in api mode.
export function getReferenceTime(): Date {
  return getDataSnapshot().referenceTime;
}
