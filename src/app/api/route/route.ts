import type { NextRequest } from "next/server";
import { apiJson } from "@/lib/api-response";
import type { LatLng, TravelMode } from "@/lib/route-watch";
import { MAX_ROUTES, ORS_PROFILE, orsRequestBody, parseOrs, parseOsrm, type ProviderResult } from "@/lib/routing";

/** Routes between two points, for Route Watch.
 *
 *   GET /api/route?from=-1.2864,36.8219&to=-1.0333,37.0693&mode=driving
 *   -> { routes: RouteGeometry[] }   recommended first, then any alternatives
 *
 * openrouteservice when ORS_API_KEY is set, falling back to OSRM
 * (ROUTING_URL for driving, ROUTING_FOOT_URL for walking; public demo
 * servers by default, light use only) if ORS is out of quota or down. See
 * lib/routing.ts. Proxied rather than called from the browser so providers
 * can change without a client release, the key stays on the server, and the
 * edge can cache: a road between two points rarely changes, so a route is
 * kept for a day. Callers round coordinates to 4 decimals so repeat journeys
 * share a cache entry — which is also what keeps ORS's daily quota ample.
 *
 * Public transport is not offered: Kenyan matatu routes aren't in either
 * provider's data. Route data © OpenStreetMap contributors (ODbL), credited
 * where it's shown. */

const ORS_URL = "https://api.openrouteservice.org/v2/directions";
const ORS_KEY = process.env.ORS_API_KEY;
const OSRM: Record<TravelMode, string> = {
  driving: process.env.ROUTING_URL ?? "https://router.project-osrm.org",
  walking: process.env.ROUTING_FOOT_URL ?? "https://routing.openstreetmap.de/routed-foot",
};
const ROUTE_CACHE_SECONDS = 86_400;
const TIMEOUT_MS = 10_000;
const USER_AGENT = "Deckwatch/1.0 (+https://deckwatch.vercel.app)";

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

async function fromOrs(from: LatLng, to: LatLng, mode: TravelMode): Promise<ProviderResult> {
  try {
    const res = await fetch(`${ORS_URL}/${ORS_PROFILE[mode]}/geojson`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: ORS_KEY!, "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify(orsRequestBody(from, to)),
    });
    return parseOrs(res.status, await res.json().catch(() => null));
  } catch (err) {
    return { kind: "failed", reason: `openrouteservice: ${(err as Error).message}` };
  }
}

async function fromOsrm(from: LatLng, to: LatLng, mode: TravelMode): Promise<ProviderResult> {
  // The profile segment is ignored by single-profile OSRM servers, which is
  // what both defaults are; it is "driving" in OSRM's URL scheme either way.
  const url =
    `${OSRM[mode]}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson&alternatives=${MAX_ROUTES - 1}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    return parseOsrm(res.status, await res.json().catch(() => null));
  } catch (err) {
    return { kind: "failed", reason: `OSRM: ${(err as Error).message}` };
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = parsePoint(params.get("from"));
  const to = parsePoint(params.get("to"));
  const mode = (params.get("mode") ?? "driving") as TravelMode;
  if (!from || !to || !(mode in OSRM)) {
    return apiJson(
      {
        error:
          "from and to must each be 'lat,lng' within Kenya, e.g. from=-1.2864,36.8219, and mode driving or walking",
      },
      { status: 400 }
    );
  }

  let result: ProviderResult = { kind: "failed", reason: "no provider" };
  if (ORS_KEY) {
    result = await fromOrs(from, to, mode);
    if (result.kind === "failed") console.error("route: falling back to OSRM:", result.reason);
  }
  if (result.kind === "failed") result = await fromOsrm(from, to, mode);

  if (result.kind === "routes") return apiJson({ routes: result.routes }, { cacheSeconds: ROUTE_CACHE_SECONDS });
  if (result.kind === "no-route") {
    return apiJson(
      { error: `No ${mode === "walking" ? "walking" : "driving"} route was found between those places.` },
      { status: 404 }
    );
  }
  console.error("route: no routing service answered:", result.reason);
  return apiJson({ error: "The routing service is unavailable. Try again shortly." }, { status: 502 });
}
