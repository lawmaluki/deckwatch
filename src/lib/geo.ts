import type { Incident } from "@/lib/types";
import { MS_PER_HOUR } from "@/lib/constants";

const EARTH_RADIUS_KM = 6371;
/** Incidents within this radius are considered geographically related. */
const SIMILAR_MAX_DISTANCE_KM = 8;
/** Incidents this close in time are considered related regardless of category. */
const SIMILAR_MAX_HOURS_APART = 72;

export function haversineDistanceKm(
  a: [number, number],
  b: [number, number]
): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

export function findSimilarIncidents(
  target: Incident,
  all: Incident[],
  maxResults = 3
): Incident[] {
  const targetTime = new Date(target.reportedAt).getTime();
  return all
    .filter((i) => i.id !== target.id)
    .map((i) => {
      const distanceKm = haversineDistanceKm(
        [target.lat, target.lng],
        [i.lat, i.lng]
      );
      const hoursApart =
        Math.abs(new Date(i.reportedAt).getTime() - targetTime) / MS_PER_HOUR;
      return { incident: i, distanceKm, hoursApart };
    })
    .filter(
      (r) =>
        r.distanceKm <= SIMILAR_MAX_DISTANCE_KM &&
        (r.hoursApart <= SIMILAR_MAX_HOURS_APART ||
          r.incident.category === target.category)
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxResults)
    .map((r) => r.incident);
}
