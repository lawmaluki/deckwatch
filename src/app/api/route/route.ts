import type { NextRequest } from "next/server";
import { apiJson } from "@/lib/api-response";
import { simplifyRoute, type LatLng, type RouteGeometry } from "@/lib/route-watch";

/** Driving route between two points, for Route Watch.
 *
 *   GET /api/route?from=-1.2864,36.8219&to=-1.0333,37.0693
 *
 * A thin proxy to an OSRM server (ROUTING_URL; the public OSRM demo by
 * default, which asks for light use only — point ROUTING_URL at a self-hosted
 * OSRM with a Kenya extract before this sees real traffic). Proxied rather
 * than called from the browser so the server can be swapped without a client
 * release, and so the edge can cache: a road between two points rarely
 * changes, so a route is kept for a day. Callers round coordinates to 4
 * decimals so repeat journeys share a cache entry.
 *
 * Route data © OpenStreetMap contributors (ODbL), credited where it's shown. */

const ROUTING_URL = process.env.ROUTING_URL ?? "https://router.project-osrm.org";
const ROUTE_CACHE_SECONDS = 86_400;
const TIMEOUT_MS = 10_000;
/** 20 m: invisible on the map and in a 1 km corridor, and turns a
 * Nairobi–Mombasa route's ~10,000 vertices into a payload worth sending. */
const SIMPLIFY_KM = 0.02;

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

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

export async function GET(request: NextRequest) {
  const from = parsePoint(request.nextUrl.searchParams.get("from"));
  const to = parsePoint(request.nextUrl.searchParams.get("to"));
  if (!from || !to) {
    return apiJson(
      { error: "from and to must each be 'lat,lng' within Kenya, e.g. from=-1.2864,36.8219" },
      { status: 400 }
    );
  }

  const url =
    `${ROUTING_URL}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson`;
  let body: OsrmResponse;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    body = (await res.json()) as OsrmResponse;
    if (!res.ok && body.code !== "NoRoute") throw new Error(`routing server ${res.status}`);
  } catch (err) {
    console.error("route: routing server unavailable", err);
    return apiJson({ error: "The routing service is unavailable. Try again shortly." }, { status: 502 });
  }

  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route) {
    return apiJson({ error: "No driving route was found between those places." }, { status: 404 });
  }

  // OSRM speaks [lng, lat]; everything here is [lat, lng], as Leaflet is.
  const coords = route.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng]);
  const result: RouteGeometry = {
    coords: simplifyRoute(coords, SIMPLIFY_KM).map(([lat, lng]) => [
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
    ]),
    distanceKm: Math.round(route.distance / 100) / 10,
    durationMin: Math.round(route.duration / 60),
  };
  return apiJson(result, { cacheSeconds: ROUTE_CACHE_SECONDS });
}
