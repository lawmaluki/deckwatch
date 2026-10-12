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
    // Paused while the tab is hidden: each refresh is a server render that
    // reads the incident list, and nobody is looking at a background tab.
    // On return, refresh at once if a poll was missed, then resume.
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastRefreshAt = Date.now(); // the page itself was just rendered
    const tick = () => {
      lastRefreshAt = Date.now();
      router.refresh();
    };
    const start = () => {
      if (timer !== null) return;
      if (Date.now() - lastRefreshAt >= POLL_INTERVAL_MS) tick();
      timer = setInterval(tick, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [router]);

  return null;
}
