import { cache } from "react";
import { BACKEND_URL } from "@/lib/backend";
import { getLiveIncidents } from "@/lib/incidents-source";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import type { Incident } from "@/lib/types";

/** One incident, complete (summary and actions included), for its shared page.
 *
 * Read from the detail endpoint rather than picked out of the list: a link is
 * opened hours or days after it was sent, by which time the incident may have
 * aged out of the live list the map polls — and the link should still work.
 * Cached per request so generateMetadata and the page share one fetch.
 */
export const getIncidentById = cache(async (id: string): Promise<Incident | null> => {
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/incidents/${encodeURIComponent(id)}`, {
        next: { revalidate: POLL_INTERVAL_MS / 1000 },
      });
      if (!res.ok) return null;
      return (await res.json()) as Incident;
    } catch (err) {
      console.error("getIncidentById: backend fetch failed", err);
      return null;
    }
  }
  return getLiveIncidents(Date.now()).find((i) => i.id === id) ?? null;
});
