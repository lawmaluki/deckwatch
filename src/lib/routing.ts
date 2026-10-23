import { haversineDistanceKm } from "@/lib/geo";
import { simplifyRoute, type LatLng, type RouteGeometry, type TravelMode } from "@/lib/route-watch";

/** Routing providers behind /api/route, and what they answer reduced to one
 * shape. Pure: the route handler does the fetching, so parsing is testable
 * without a network or an API key.
 *
 *   openrouteservice  primary when ORS_API_KEY is set: hosted, free plan of
 *                     2,000 directions a day and 40 a minute
 *   OSRM              ROUTING_URL / ROUTING_FOOT_URL, the public demo
 *                     servers by default (light use only); the fallback when
 *                     ORS is unset, out of quota or down */

/** 20 m: invisible on the map and in a 1 km corridor, and turns a
 * Nairobi–Mombasa route's ~10,000 vertices into a payload worth sending. */
const SIMPLIFY_KM = 0.02;
export const MAX_ROUTES = 3;

export const ORS_PROFILE: Record<TravelMode, string> = { driving: "driving-car", walking: "foot-walking" };

/** ORS computes alternatives only for routes under 100 km and rejects the
 * request otherwise. Road distance runs well above the straight line, so ask
 * only when the ends are under this far apart. */
const ORS_ALTERNATIVES_MAX_STRAIGHT_KM = 70;

export function orsRequestBody(from: LatLng, to: LatLng): Record<string, unknown> {
  const body: Record<string, unknown> = {
    coordinates: [
      [from[1], from[0]],
      [to[1], to[0]],
    ],
  };
  if (haversineDistanceKm(from, to) < ORS_ALTERNATIVES_MAX_STRAIGHT_KM) {
    body.alternative_routes = { target_count: MAX_ROUTES, weight_factor: 1.4, share_factor: 0.6 };
  }
  return body;
}

function geometry(coordsLngLat: [number, number][], distanceM: number, durationS: number): RouteGeometry {
  // Providers speak [lng, lat]; everything here is [lat, lng], as Leaflet is.
  const coords = coordsLngLat.map(([lng, lat]): LatLng => [lat, lng]);
  return {
    coords: simplifyRoute(coords, SIMPLIFY_KM).map(([lat, lng]) => [
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
    ]),
    distanceKm: Math.round(distanceM / 100) / 10,
    durationMin: Math.round(durationS / 60),
  };
}

export type ProviderResult =
  | { kind: "routes"; routes: RouteGeometry[] }
  /** The provider worked and says there is no route: final, don't retry. */
  | { kind: "no-route" }
  /** The provider failed (quota, outage, bad answer): try the next one. */
  | { kind: "failed"; reason: string };

interface OrsFeature {
  geometry?: { coordinates?: [number, number][] };
  properties?: { summary?: { distance?: number; duration?: number } };
}

/** An openrouteservice /v2/directions/{profile}/geojson answer. */
export function parseOrs(status: number, body: unknown): ProviderResult {
  const b = body as { features?: OrsFeature[]; error?: { code?: number; message?: string } | string };
  // 2009: route could not be found; 2010: a point isn't near any road.
  const code = typeof b?.error === "object" ? b.error?.code : undefined;
  if (code === 2009 || code === 2010) return { kind: "no-route" };
  if (status !== 200 || !Array.isArray(b?.features)) {
    const message = typeof b?.error === "object" ? b.error?.message : b?.error;
    return { kind: "failed", reason: `openrouteservice ${status}${code ? ` (${code})` : ""}: ${message ?? "no routes"}` };
  }
  const routes = b.features
    .filter((f) => f.geometry?.coordinates?.length && f.properties?.summary)
    .slice(0, MAX_ROUTES)
    .map((f) => geometry(f.geometry!.coordinates!, f.properties!.summary!.distance ?? 0, f.properties!.summary!.duration ?? 0));
  return routes.length ? { kind: "routes", routes } : { kind: "no-route" };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

/** An OSRM /route/v1 answer (overview=full, geometries=geojson). */
export function parseOsrm(status: number, body: unknown): ProviderResult {
  const b = body as { code?: string; routes?: OsrmRoute[]; message?: string };
  if (b?.code === "NoRoute") return { kind: "no-route" };
  if (status !== 200 || b?.code !== "Ok" || !b.routes?.length) {
    return { kind: "failed", reason: `OSRM ${status}: ${b?.code ?? ""} ${b?.message ?? ""}`.trim() };
  }
  return {
    kind: "routes",
    routes: b.routes.slice(0, MAX_ROUTES).map((r) => geometry(r.geometry.coordinates, r.distance, r.duration)),
  };
}
