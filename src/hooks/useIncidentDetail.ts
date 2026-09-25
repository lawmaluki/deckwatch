"use client";

import { useEffect, useState } from "react";
import type { Incident } from "@/lib/types";

/** Fills in the fields the list leaves out, for the one incident opened.
 *
 * aiSummary and recommendedActions are ~35% of a list response and are read
 * only here, so /api/incidents omits them and /api/incidents/{id} serves
 * them. Returns null until the fetch lands — and permanently when the
 * incident already arrived complete, as it does from the mock dataset.
 */
export function useIncidentDetail(incident: Incident | null): Incident | null {
  // Stored with the id it belongs to, so switching incidents drops the
  // previous detail by derivation rather than by clearing state in an
  // effect — otherwise the last summary lingers under the new title.
  const [fetched, setFetched] = useState<{ id: string; incident: Incident } | null>(null);
  const id = incident?.id ?? null;
  const alreadyComplete = incident?.aiSummary !== undefined;

  useEffect(() => {
    if (id === null || alreadyComplete) return;

    // Ignore a response for an incident the reader has already moved off:
    // two fetches in flight can otherwise resolve out of order.
    let active = true;
    fetch(`/api/incidents/${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: Incident | null) => {
        if (active && body) setFetched({ id, incident: body });
      })
      .catch(() => {
        // Leaves the panel on the summary it already has; the sections that
        // need this render their own pending state.
      });
    return () => {
      active = false;
    };
  }, [id, alreadyComplete]);

  return fetched && fetched.id === id ? fetched.incident : null;
}
