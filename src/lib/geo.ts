import type { Incident } from "@/lib/types";

const EARTH_RADIUS_KM = 6371;

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
        Math.abs(new Date(i.reportedAt).getTime() - targetTime) /
        (1000 * 60 * 60);
      return { incident: i, distanceKm, hoursApart };
    })
    .filter(
      (r) =>
        r.distanceKm <= 8 &&
        (r.hoursApart <= 72 || r.incident.category === target.category)
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxResults)
    .map((r) => r.incident);
}
