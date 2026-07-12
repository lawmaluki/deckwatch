"use client";

import { useSyncExternalStore } from "react";
import {
  getDataSnapshot,
  replaceClientSnapshot,
  USE_API,
} from "@/lib/incidents-source";
import type { Incident } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

// Module-scoped poller shared by every component using this hook: one
// interval and one in-flight request total, not one per consumer.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function refresh(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch("/api/incidents");
    if (!res.ok) return; // keep last good snapshot
    const body = (await res.json()) as { asOf: string; results: Incident[] };
    // Incidents and clock advance atomically so duration math stays coherent.
    replaceClientSnapshot({
      incidents: body.results,
      referenceTime: new Date(body.asOf),
    });
    listeners.forEach((l) => l());
  } catch {
    // Network failure: keep last good snapshot. Error surfacing comes with
    // real data.
  } finally {
    inFlight = false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (USE_API && timer === null) {
    void refresh();
    timer = setInterval(refresh, POLL_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export interface IncidentsResult {
  incidents: Incident[];
  referenceTime: Date;
}

// Client adapter over the incidents-source seam. Mock mode returns the fixed
// deterministic snapshot with no fetching. In api mode the snapshot is
// re-read from /api/incidents on mount and then every POLL_INTERVAL_MS; the
// initial client snapshot is time-shift-invariant with the server render, so
// hydration is safe with no flash.
export function useIncidents(): IncidentsResult {
  return useSyncExternalStore(subscribe, getDataSnapshot, getDataSnapshot);
}
