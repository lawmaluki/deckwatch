"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { USE_API } from "@/lib/incidents-source";
import { POLL_INTERVAL_MS } from "@/lib/constants";

/** Re-runs the server render on the map's polling cadence, so a dashboard left
 * open keeps pace with ingestion instead of freezing at page load.
 *
 * router.refresh() rather than a client-side fetch: the server page filters to
 * isLive, shares one backend fetch per request and derives every statistic
 * from it. Re-reading that from the client would mean duplicating the lot and
 * reconciling two snapshots against the SSR'd HTML — the hydration problem the
 * seam in incidents-source.ts exists to avoid. */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Mock mode is anchored to a fixed clock, so there is nothing to refresh to.
    if (!USE_API) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
