import { haversineDistanceKm } from "@/lib/geo";
import type { Incident } from "@/lib/types";
import type { NotificationSubscription } from "@/store/useAppStore";

export interface Coords {
  lat: number;
  lng: number;
}

/** Whether an incident is one this subscription asked to hear about.
 *
 * Place and kind are separate tests, both of which pass by default: an empty
 * subscription alerts on everything rather than nothing, because a reader who
 * has opened the panel and set nothing is asking to be kept informed, not to
 * be kept silent.
 *
 * Within place, county and radius are alternatives rather than a narrowing —
 * someone who picks their home county *and* a radius around where they are
 * standing wants both, not only the overlap, which is frequently empty. */
export function matchesSubscription(
  incident: Incident,
  sub: NotificationSubscription,
  location: Coords | null
): boolean {
  if (sub.categories.length > 0 && !sub.categories.includes(incident.category)) {
    return false;
  }

  const origin = sub.useLocation ? location : null;
  if (sub.counties.length === 0 && origin === null) return true;

  const inCounty = sub.counties.includes(incident.county);
  const inRadius =
    origin !== null &&
    haversineDistanceKm([origin.lat, origin.lng], [incident.lat, incident.lng]) <=
      sub.radiusKm;

  return inCounty || inRadius;
}

/** Whether the reader has actually set this subscription up.
 *
 * Channels don't count: they're on by default and say how to reach someone,
 * not what to reach them about. A subscription nobody has narrowed still
 * alerts on everything — it just isn't something they chose, so the bell has
 * nothing to advertise. */
export function hasActiveSubscription(sub: NotificationSubscription): boolean {
  return sub.counties.length > 0 || sub.categories.length > 0 || sub.useLocation;
}

/** Ids present in `next` that weren't in `seen`.
 *
 * Kept separate from the watcher so "what is new" stays decidable without a
 * React tree — the watcher's job is only to decide when to ask. */
export function newIncidents(next: Incident[], seen: ReadonlySet<string>): Incident[] {
  return next.filter((i) => !seen.has(i.id));
}
