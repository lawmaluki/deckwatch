"use client";

import { useContext, useSyncExternalStore } from "react";
import { IncidentsBootstrapContext } from "@/components/data/IncidentsBootstrap";
import {
  getDataSnapshot,
  replaceClientSnapshot,
  USE_API,
} from "@/lib/incidents-source";
import type { Incident } from "@/lib/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import { wantsBackgroundAlerts } from "@/lib/alerts";
import { useAppStore } from "@/store/useAppStore";

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
      polled: true,
    });
    listeners.forEach((l) => l());
  } catch {
    // Network failure: keep last good snapshot. Error surfacing comes with
    // real data.
  } finally {
    inFlight = false;
  }
}

// Polling stops while the tab is hidden: a map left open in a background tab
// all day used to re-download every incident on every tick, for no reader.
// Coming back to the tab refreshes at once if the data is due, then resumes.
// The exception is a reader waiting on desktop notifications, who is only
// reached while the tab is hidden (see wantsBackgroundAlerts).
let lastRefreshAt = 0;

function keepPollingWhileHidden(): boolean {
  const { notifications, savedRoutes } = useAppStore.getState();
  const permission = typeof Notification === "undefined" ? null : Notification.permission;
  return wantsBackgroundAlerts(notifications, savedRoutes.some((r) => r.alerts), permission);
}

function startTimer(): void {
  if (timer !== null) return;
  if (Date.now() - lastRefreshAt >= POLL_INTERVAL_MS) {
    lastRefreshAt = Date.now();
    void refresh();
  }
  timer = setInterval(() => {
    lastRefreshAt = Date.now();
    void refresh();
  }, POLL_INTERVAL_MS);
}

function stopTimer(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function onVisibilityChange(): void {
  if (document.hidden) {
    if (!keepPollingWhileHidden()) stopTimer();
  } else if (listeners.size > 0) startTimer();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (USE_API && listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden || keepPollingWhileHidden()) startTimer();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTimer();
    }
  };
}

export interface IncidentsResult {
  incidents: Incident[];
  referenceTime: Date;
  polled: boolean;
}

// Client adapter over the incidents-source seam. Mock mode returns the fixed
// deterministic snapshot with no fetching. In api mode the snapshot is
// re-read from /api/incidents on mount and then every POLL_INTERVAL_MS; the
// initial client snapshot is time-shift-invariant with the server render, so
// hydration is safe with no flash.
export function useIncidents(): IncidentsResult {
  // In live mode the server rendered with real data (IncidentsBootstrap); the
  // browser's store was primed with the same object, so both sides agree.
  const bootstrap = useContext(IncidentsBootstrapContext);
  return useSyncExternalStore(subscribe, getDataSnapshot, () => bootstrap ?? getDataSnapshot());
}
