import { haversineDistanceKm } from "@/lib/geo";
import { MS_PER_HOUR } from "@/lib/constants";
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

/** An incident older than this never raises an alert, however it reaches the
 * browser. "New to this session" should already rule old ones out; this is
 * the backstop for when the session's idea of "already seen" is incomplete,
 * which is how two-month-old incidents once popped up as fresh alerts. */
export const ALERT_MAX_AGE_HOURS = 24;

export function recentEnoughToAlert(incident: Incident, nowMs: number): boolean {
  return nowMs - Date.parse(incident.reportedAt) <= ALERT_MAX_AGE_HOURS * MS_PER_HOUR;
}

/** Whether a snapshot can define "what was already here" for alerts. In api
 * mode the first snapshot is sample data used only for hydration: remembering
 * it would make every real incident look new when the first poll lands. */
export function canSeedAlerts(snapshot: { polled: boolean }, usingApi: boolean): boolean {
  return snapshot.polled || !usingApi;
}

/** Ids present in `next` that weren't in `seen`.
 *
 * Kept separate from the watcher so "what is new" stays decidable without a
 * React tree — the watcher's job is only to decide when to ask. */
export function newIncidents(next: Incident[], seen: ReadonlySet<string>): Incident[] {
  return next.filter((i) => !seen.has(i.id));
}
