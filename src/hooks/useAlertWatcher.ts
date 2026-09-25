"use client";

import { useEffect, useRef } from "react";
import { useIncidents } from "@/hooks/useIncidents";
import { useAppStore } from "@/store/useAppStore";
import { useAlertStore } from "@/store/useAlertStore";
import { useMapFocus } from "@/hooks/useMapFocus";
import { matchesSubscription, newIncidents } from "@/lib/alerts";
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
  const { incidents } = useIncidents();
  const subscription = useAppStore((s) => s.notifications);
  const location = useAppStore((s) => s.userLocation);
  const raise = useAlertStore((s) => s.raise);
  const focus = useMapFocus();

  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(incidents.map((i) => i.id));
      return;
    }

    const arrived = newIncidents(incidents, seen.current);
    if (arrived.length === 0) return;
    for (const incident of arrived) seen.current.add(incident.id);

    const matching = arrived.filter((i) =>
      matchesSubscription(i, subscription, location)
    );
    if (matching.length === 0) return;

    raise(matching);
    if (subscription.channels.push) {
      matching.forEach((incident) =>
        notifyOs(incident, () => focus({ kind: "incident", value: incident.id }))
      );
    }
  }, [incidents, subscription, location, raise, focus]);
}

/** Best-effort OS notification. Silent when unsupported or not granted — the
 * in-app toast has already fired, so this is the second of two channels rather
 * than the only one, and a failure here is not worth surfacing. */
function notifyOs(incident: Incident, openOnMap: () => void): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  try {
    const notification = new Notification(CATEGORIES[incident.category].label, {
      body: `${incident.title} — ${incident.county} County`,
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
