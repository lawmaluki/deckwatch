import type { NextRequest } from "next/server";
import { apiJson } from "@/lib/api-response";
import { simplifyRoute, type LatLng, type RouteGeometry, type TravelMode } from "@/lib/route-watch";

/** Routes between two points, for Route Watch.
 *
 *   GET /api/route?from=-1.2864,36.8219&to=-1.0333,37.0693&mode=driving
 *   -> { routes: RouteGeometry[] }   recommended first, then any alternatives
 *
 * A thin proxy to OSRM servers: ROUTING_URL for driving (the public OSRM demo
 * by default) and ROUTING_FOOT_URL for walking (FOSSGIS's foot router by
 * default). Both public servers ask for light use only — point these at a
 * self-hosted OSRM with a Kenya extract before this sees real traffic.
 * Proxied rather than called from the browser so the servers can be swapped
 * without a client release, and so the edge can cache: a road between two
 * points rarely changes, so a route is kept for a day. Callers round
 * coordinates to 4 decimals so repeat journeys share a cache entry.
 *
 * Public transport is not offered: Kenyan matatu routes aren't in OSRM, and
 * routing on them needs a transit planner and timetable data.
 *
 * Route data © OpenStreetMap contributors (ODbL), credited where it's shown. */

const SERVERS: Record<TravelMode, string> = {
  driving: process.env.ROUTING_URL ?? "https://router.project-osrm.org",
  walking: process.env.ROUTING_FOOT_URL ?? "https://routing.openstreetmap.de/routed-foot",
};
const ROUTE_CACHE_SECONDS = 86_400;
const TIMEOUT_MS = 10_000;
/** 20 m: invisible on the map and in a 1 km corridor, and turns a
 * Nairobi–Mombasa route's ~10,000 vertices into a payload worth sending. */
const SIMPLIFY_KM = 0.02;
const MAX_ALTERNATIVES = 3;

// Kenya with a margin for border towns; mirrors the map's bounds.
const LAT_MIN = -5.0, LAT_MAX = 5.5, LNG_MIN = 33.0, LNG_MAX = 42.5;

function parsePoint(raw: string | null): LatLng | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng] = parts;
  if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) return null;
  return [Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4];
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
}

function toGeometry(route: OsrmRoute): RouteGeometry {
  // OSRM speaks [lng, lat]; everything here is [lat, lng], as Leaflet is.
  const coords = route.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng]);
  return {
    coords: simplifyRoute(coords, SIMPLIFY_KM).map(([lat, lng]) => [
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
    ]),
    distanceKm: Math.round(route.distance / 100) / 10,
    durationMin: Math.round(route.duration / 60),
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = parsePoint(params.get("from"));
  const to = parsePoint(params.get("to"));
  const mode = (params.get("mode") ?? "driving") as TravelMode;
  if (!from || !to || !(mode in SERVERS)) {
    return apiJson(
      {
        error:
          "from and to must each be 'lat,lng' within Kenya, e.g. from=-1.2864,36.8219, and mode driving or walking",
      },
      { status: 400 }
    );
  }

  // The profile segment is ignored by single-profile OSRM servers, which is
  // what both defaults are; it is "driving" in OSRM's URL scheme either way.
  const url =
    `${SERVERS[mode]}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson&alternatives=${MAX_ALTERNATIVES - 1}`;
  let body: OsrmResponse;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Deckwatch/1.0 (+https://deckwatch.vercel.app)" },
    });
    body = (await res.json()) as OsrmResponse;
    if (!res.ok && body.code !== "NoRoute") throw new Error(`routing server ${res.status}`);
  } catch (err) {
    console.error("route: routing server unavailable", err);
    return apiJson({ error: "The routing service is unavailable. Try again shortly." }, { status: 502 });
  }

  if (body.code !== "Ok" || !body.routes?.length) {
    return apiJson(
      { error: `No ${mode === "walking" ? "walking" : "driving"} route was found between those places.` },
      { status: 404 }
    );
  }

  return apiJson(
    { routes: body.routes.slice(0, MAX_ALTERNATIVES).map(toGeometry) },
    { cacheSeconds: ROUTE_CACHE_SECONDS }
  );
}
