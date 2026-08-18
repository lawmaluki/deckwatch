import { cache } from "react";
import { MOCK_INCIDENTS, DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { BACKEND_URL } from "@/lib/backend";
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

// Memoized per request: getReferenceTime() (via getDataSnapshot) is a sync
// default-param dependency of hoursAgo/relativeTime/dailyTrend, so a single
// server render can call it many times. Without caching, each call reads a
// fresh Date.now(), and a page like the dashboard — which reads it directly
// for "data as of" *and* indirectly through dailyTrend()/relativeTime() for
// every listed incident — could see those calls straddle a minute boundary
// and render inconsistent text, which Next then flags as a hydration
// mismatch on top of the JSON, before there's even a client to hydrate
// against.
const getRequestNowMs = cache((): number => Date.now());

export function getDataSnapshot(): DataSnapshot {
  if (!USE_API) return MOCK_SNAPSHOT;
  if (IS_SERVER) return liveSnapshot(getRequestNowMs());
  clientSnapshot ??= liveSnapshot(Date.now());
  return clientSnapshot;
}

// Called only by the useIncidents poll (client, api mode).
export function replaceClientSnapshot(next: DataSnapshot): void {
  clientSnapshot = next;
}

// Server-rendered pages (dashboard, counties, county detail) read through
// here, not through useIncidents()/getDataSnapshot() — those exist to keep
// the client map's SSR and hydration snapshots identical, which server
// pages don't need. So this talks to the real backend directly, and filters
// to live incidents on success (matching the map's default), falling back
// to the unfiltered shifted seed if the backend is unreachable rather than
// rendering an empty page.
//
// Wrapped in React's cache() so every getIncidents() call within one request
// shares a single fetch. Without this, Next can invoke a dynamic page's
// server component more than once per request (e.g. an aborted prerender
// attempt before the connection()-forced dynamic render), and since the
// ingest cron is writing continuously, two independent no-store fetches
// moments apart can return different data — producing a hydration mismatch
// between what got embedded in the HTML and what the client expects.
const fetchBackendIncidents = cache(async (): Promise<Incident[] | null> => {
  if (!BACKEND_URL) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/incidents`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { results: Incident[] };
    return body.results;
  } catch (err) {
    console.error("getIncidents: backend fetch failed, falling back to seed", err);
    return null;
  }
});

export async function getIncidents(): Promise<Incident[]> {
  if (IS_SERVER && USE_API) {
    const backend = await fetchBackendIncidents();
    if (backend) return backend.filter((i) => i.isLive);
  }
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
