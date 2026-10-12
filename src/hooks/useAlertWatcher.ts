"use client";

import { useEffect, useRef } from "react";
import { useIncidents } from "@/hooks/useIncidents";
import { useAppStore } from "@/store/useAppStore";
import { useAlertStore } from "@/store/useAlertStore";
import { useMapFocus } from "@/hooks/useMapFocus";
import { canSeedAlerts, matchesSubscription, newIncidents, recentEnoughToAlert } from "@/lib/alerts";
import { formatKm, routeName, savedRouteHit } from "@/lib/route-watch";
import { USE_API } from "@/lib/incidents-source";
import { CATEGORIES } from "@/lib/data/categories";
import type { Incident } from "@/lib/types";

/** Raises an alert for incidents that arrive while the reader is here and match
 * their subscription.
 *
 * "New" means new to this session, not recent: the first snapshot only seeds
 * what's already known, or opening the site would fire an alert for every
 * incident on the map. Delivery is therefore as live as the poll behind it —
 * within a minute — and never retroactive. */
export function useAlertWatcher(): void {
  const snapshot = useIncidents();
  const subscription = useAppStore((s) => s.notifications);
  const location = useAppStore((s) => s.userLocation);
  const savedRoutes = useAppStore((s) => s.savedRoutes);
  const raise = useAlertStore((s) => s.raise);
  const focus = useMapFocus();

  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Wait for real data before remembering anything: see canSeedAlerts.
    if (!canSeedAlerts(snapshot, USE_API)) return;
    if (seen.current === null) {
      seen.current = new Set(snapshot.incidents.map((i) => i.id));
      return;
    }

    const arrived = newIncidents(snapshot.incidents, seen.current);
    if (arrived.length === 0) return;
    for (const incident of arrived) seen.current.add(incident.id);

    const nowMs = snapshot.referenceTime.getTime();
    const fresh = arrived.filter((i) => recentEnoughToAlert(i, nowMs));
    // A saved route is a narrower ask than the subscription, so an incident on
    // one says so — and is raised once, with that context, not twice.
    const onRoute = new Map<string, string>();
    for (const incident of fresh) {
      const hit = savedRouteHit(incident, savedRoutes);
      if (hit) {
        onRoute.set(incident.id, `On ${routeName(hit.route)}, ${formatKm(hit.match.alongKm)} in`);
      }
    }
    const matching = fresh.filter(
      (i) => onRoute.has(i.id) || matchesSubscription(i, subscription, location)
    );
    if (matching.length === 0) return;

    raise(matching, (i) => onRoute.get(i.id));
    if (subscription.channels.push) {
      matching.forEach((incident) =>
        notifyOs(incident, onRoute.get(incident.id), () =>
          focus({ kind: "incident", value: incident.id })
        )
      );
    }
  }, [snapshot, subscription, location, savedRoutes, raise, focus]);
}

/** Best-effort OS notification. Silent when unsupported or not granted — the
 * in-app toast has already fired, so this is the second of two channels rather
 * than the only one, and a failure here is not worth surfacing. */
function notifyOs(incident: Incident, context: string | undefined, openOnMap: () => void): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  try {
    const notification = new Notification(CATEGORIES[incident.category].label, {
      body: `${context ? `${context}: ` : ""}${incident.title} — ${incident.county} County`,
      tag: incident.id,
    });
    notification.onclick = () => {
      window.focus();
      // Routed, not just selected: the reader may have been left on the
      // dashboard or a county page, where nothing renders the selection.
      openOnMap();
    };
  } catch {
    // Some browsers throw on construction where a service worker is expected.
  }
}
