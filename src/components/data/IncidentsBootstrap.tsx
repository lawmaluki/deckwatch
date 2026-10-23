"use client";

import { createContext, useMemo } from "react";
import { primeClientSnapshot, type DataSnapshot } from "@/lib/incidents-source";
import type { Incident } from "@/lib/types";

/** The real incidents a page was rendered with, in live (api) mode.
 *
 * Without it the first snapshot, on the server and in the browser until the
 * first poll returned, was the sample dataset: every fresh visit opened on
 * invented incidents and "10 incidents today", for as long as the backend
 * took to answer, the better part of a minute when Render's free instance had
 * spun down. The root layout now reads the same cached backend data the
 * dashboard uses and hands it down here. Null in sample mode, where the seed
 * is the data. */
export const IncidentsBootstrapContext = createContext<DataSnapshot | null>(null);

export function IncidentsBootstrap({
  incidents,
  asOf,
  available,
  children,
}: {
  incidents: Incident[];
  asOf: string;
  /** False when the backend couldn't be reached: the map starts empty and
   * waits for the poll, rather than showing anything as collected. */
  available: boolean;
  children: React.ReactNode;
}) {
  const snapshot = useMemo<DataSnapshot>(
    () => ({ incidents, referenceTime: new Date(asOf), polled: available }),
    [incidents, asOf, available]
  );
  // Before any child reads the store: useIncidents' first client snapshot
  // must be this same object, or hydration would re-render with another.
  primeClientSnapshot(snapshot);
  return <IncidentsBootstrapContext.Provider value={snapshot}>{children}</IncidentsBootstrapContext.Provider>;
}
