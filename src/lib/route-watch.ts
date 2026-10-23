import type { FeatureCollection, Geometry, Position } from "geojson";
import { COUNTY_BY_NAME } from "@/lib/data/counties";
import { MS_PER_HOUR } from "@/lib/constants";
import type { Category, Incident, LocationPrecision } from "@/lib/types";

/** Route Watch: which reported incidents sit along a journey.
 *
 * Pure and DOM-free, so the page, the alert watcher and the tests share one
 * answer. A route is a polyline of [lat, lng]; incidents are matched against
 * it by distance from the line, and ordered by how far along it they are —
 * the order someone driving it meets them in.
 *
 * What it will never say is that a route is safe. Matching only knows what
 * newsrooms reported and where the geocoder could place it, and most reports
 * name only a county: those are listed apart, never pinned onto the route. */

export type LatLng = [number, number];

/** How the route is travelled. Public transport isn't offered: matatu routes
 * aren't in OSRM (see app/api/route/route.ts). */
export type TravelMode = "driving" | "walking";

export const TRAVEL_MODES: Record<TravelMode, { label: string; defaultBufferKm: number; approachKm: number }> = {
  // approachKm: how far ahead an incident is when a trip warns about it —
  // a few minutes' notice at the pace of each mode.
  driving: { label: "Driving", defaultBufferKm: 2, approachKm: 5 },
  walking: { label: "Walking", defaultBufferKm: 1, approachKm: 0.5 },
};

export interface RoutePlace {
  name: string;
  county: string | null;
  lat: number;
  lng: number;
}

export interface RouteGeometry {
  coords: LatLng[];
  distanceKm: number;
  durationMin: number;
}

/** The incident filter the concept offers, as groups of categories. */
export type RouteIncidentGroup = "all" | "security" | "road" | "weather";

export const ROUTE_GROUPS: Record<RouteIncidentGroup, { label: string; categories: Category[] | null }> = {
  all: { label: "All incidents", categories: null },
  security: {
    label: "Safety and security",
    categories: ["crime", "unrest", "terror_alert", "election_violence", "missing_person"],
  },
  road: {
    label: "Road disruptions",
    categories: ["traffic_accident", "infrastructure", "fire", "wildlife"],
  },
  weather: { label: "Weather and flooding", categories: ["flood"] },
};

/** Corridor widths offered: how far either side of the road to look. */
export const BUFFER_OPTIONS_KM = [1, 2, 3, 5] as const;
export const DEFAULT_BUFFER_KM = 2;
/** How far back to look. Two days by default: Route Watch is about what is
 * happening now, and a week-old crash is not on the road any more. */
export const WINDOW_OPTIONS_HOURS = [6, 24, 48, 168] as const;
export const DEFAULT_WINDOW_HOURS = 48;

/** Extra reach for a point that stands for more than one spot. A town's point
 * is its centre while the highway may skirt its edge; an area's is a few km
 * across. Without this, "Crash in Juja" misses the Thika Road route that runs
 * through Juja two km from the point. */
const PRECISION_SLACK_KM: Record<Exclude<LocationPrecision, "county">, number> = {
  local: 0,
  town: 2,
  road: 0,
  area: 4,
};

/** Popular journeys, offered as one-tap starting points. */
export const POPULAR_ROUTES: { from: RoutePlace; to: RoutePlace }[] = [
  { from: { name: "Nairobi CBD", county: "Nairobi", lat: -1.2864, lng: 36.8219 }, to: { name: "Thika", county: "Kiambu", lat: -1.0333, lng: 37.0693 } },
  { from: { name: "Nairobi CBD", county: "Nairobi", lat: -1.2864, lng: 36.8219 }, to: { name: "Mombasa", county: "Mombasa", lat: -4.0547, lng: 39.6636 } },
  { from: { name: "Nairobi CBD", county: "Nairobi", lat: -1.2864, lng: 36.8219 }, to: { name: "Nakuru", county: "Nakuru", lat: -0.2833, lng: 36.0667 } },
  { from: { name: "Nakuru", county: "Nakuru", lat: -0.2833, lng: 36.0667 }, to: { name: "Eldoret", county: "Uasin Gishu", lat: 0.5143, lng: 35.2698 } },
  { from: { name: "Nairobi CBD", county: "Nairobi", lat: -1.2864, lng: 36.8219 }, to: { name: "Kisumu", county: "Kisumu", lat: -0.1022, lng: 34.7617 } },
  { from: { name: "Mombasa", county: "Mombasa", lat: -4.0547, lng: 39.6636 }, to: { name: "Malindi", county: "Kilifi", lat: -3.2192, lng: 40.1169 } },
];

// --- geometry --------------------------------------------------------------
//
// Equirectangular projection around the route's mean latitude. Kenya straddles
// the equator, so over a few hundred km the error is far below the width of
// the corridor — and it keeps point-to-segment distance plain arithmetic.

const KM_PER_DEG = 111.32;

export interface PreparedRoute {
  /** Projected vertices in km. */
  xs: number[];
  ys: number[];
  /** Distance along the route at each vertex, km. */
  along: number[];
  cosLat: number;
  lengthKm: number;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export function prepareRoute(coords: LatLng[]): PreparedRoute {
  const meanLat = coords.reduce((s, c) => s + c[0], 0) / Math.max(coords.length, 1);
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const xs: number[] = [];
  const ys: number[] = [];
  const along: number[] = [];
  let total = 0;
  const bbox = { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity };
  coords.forEach(([lat, lng], i) => {
    const x = lng * KM_PER_DEG * cosLat;
    const y = lat * KM_PER_DEG;
    if (i > 0) total += Math.hypot(x - xs[i - 1], y - ys[i - 1]);
    xs.push(x);
    ys.push(y);
    along.push(total);
    bbox.minLat = Math.min(bbox.minLat, lat);
    bbox.maxLat = Math.max(bbox.maxLat, lat);
    bbox.minLng = Math.min(bbox.minLng, lng);
    bbox.maxLng = Math.max(bbox.maxLng, lng);
  });
  return { xs, ys, along, cosLat, lengthKm: total, bbox };
}

/** How far a point is from the route, and how far along the route its
 * nearest point is. */
export function locateOnRoute(route: PreparedRoute, lat: number, lng: number): { offRouteKm: number; alongKm: number } {
  const px = lng * KM_PER_DEG * route.cosLat;
  const py = lat * KM_PER_DEG;
  let best = { offRouteKm: Infinity, alongKm: 0 };
  const n = route.xs.length;
  if (n === 1) {
    return { offRouteKm: Math.hypot(px - route.xs[0], py - route.ys[0]), alongKm: 0 };
  }
  for (let i = 0; i < n - 1; i++) {
    const ax = route.xs[i], ay = route.ys[i];
    const dx = route.xs[i + 1] - ax, dy = route.ys[i + 1] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best.offRouteKm) {
      best = { offRouteKm: d, alongKm: route.along[i] + t * Math.sqrt(len2) };
    }
  }
  return best;
}

/** Douglas–Peucker in km, for storing a saved route compactly. */
export function simplifyRoute(coords: LatLng[], toleranceKm: number): LatLng[] {
  if (coords.length <= 2) return coords;
  const p = prepareRoute(coords);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, worstD = 0;
    const dx = p.xs[b] - p.xs[a], dy = p.ys[b] - p.ys[a];
    const len = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = len === 0
        ? Math.hypot(p.xs[i] - p.xs[a], p.ys[i] - p.ys[a])
        : Math.abs(dy * (p.xs[i] - p.xs[a]) - dx * (p.ys[i] - p.ys[a])) / len;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0 && worstD > toleranceKm) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

// --- counties ----------------------------------------------------------------

function inRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inGeometry(lng: number, lat: number, g: Geometry): boolean {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  return polygons.some(
    (rings) => inRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lng, lat, hole))
  );
}

/** The counties a route passes through, in the order it enters them.
 * Sampled every `stepKm` along the line: a county crossed for less than that
 * can be missed, which at 1 km is a corner nobody would call passing through. */
export function countiesAlongRoute(coords: LatLng[], counties: FeatureCollection, stepKm = 1): string[] {
  const route = prepareRoute(coords);
  const out: string[] = [];
  let last: string | null = null;
  const features = counties.features.filter((f) => f.geometry && typeof f.properties?.name === "string");
  const at = (lat: number, lng: number): string | null => {
    if (last) {
      const f = features.find((x) => x.properties!.name === last);
      if (f && inGeometry(lng, lat, f.geometry)) return last;
    }
    const hit = features.find((f) => inGeometry(lng, lat, f.geometry));
    return hit ? (hit.properties!.name as string) : null;
  };
  for (let i = 0; i < coords.length; i++) {
    const steps = i === 0 ? 1 : Math.max(1, Math.ceil((route.along[i] - route.along[i - 1]) / stepKm));
    for (let s = 1; s <= steps; s++) {
      const t = i === 0 ? 1 : s / steps;
      const [lat0, lng0] = i === 0 ? coords[0] : coords[i - 1];
      const [lat1, lng1] = coords[i];
      const name = at(lat0 + t * (lat1 - lat0), lng0 + t * (lng1 - lng0));
      if (name && name !== last) {
        if (!out.includes(name)) out.push(name);
        last = name;
      }
    }
  }
  return out;
}

// --- matching ---------------------------------------------------------------

/** What an incident's point stands for. Incidents stored before precision
 * was recorded are worked out from the point: at the county centre means the
 * county was all that was known. */
export function precisionOf(incident: Incident): LocationPrecision {
  if (incident.locationPrecision) return incident.locationPrecision;
  const centre = COUNTY_BY_NAME[incident.county]?.center;
  if (centre && Math.abs(centre[0] - incident.lat) < 1e-4 && Math.abs(centre[1] - incident.lng) < 1e-4) {
    return "county";
  }
  return "local";
}

export interface RouteMatch {
  incident: Incident;
  precision: Exclude<LocationPrecision, "county">;
  offRouteKm: number;
  alongKm: number;
}

export interface RouteMatchOptions {
  bufferKm: number;
  windowHours: number;
  group: RouteIncidentGroup;
  nowMs: number;
  /** Counties the route crosses: where a county-level report is listed. */
  counties: readonly string[];
}

export interface RouteMatches {
  /** Placed within the corridor, in the order the route meets them. */
  along: RouteMatch[];
  /** Only the county, or a road somewhere in it, is known, and the route
   * crosses that county. Newest first. */
  inCounties: Incident[];
}

function inGroup(incident: Incident, group: RouteIncidentGroup): boolean {
  const categories = ROUTE_GROUPS[group].categories;
  return categories === null || categories.includes(incident.category);
}

function recent(incident: Incident, nowMs: number, windowHours: number): boolean {
  const age = nowMs - Date.parse(incident.reportedAt);
  return age <= windowHours * MS_PER_HOUR && age >= -MS_PER_HOUR;
}

/** Where one incident sits relative to a route, or null if it isn't on it. */
/** Precisions whose point says nothing about where on the ground it was.
 * A road incident's point is one end of the road, the end in the county it
 * was filed under: the Kikopey crash on the Nairobi-Nakuru highway sits at
 * the Nairobi end, and would read as "on your route" from Nairobi to Thika. */
const NOT_PINNABLE: ReadonlySet<LocationPrecision> = new Set(["county", "road"]);

export function matchIncident(route: PreparedRoute, incident: Incident, bufferKm: number): RouteMatch | null {
  const precision = precisionOf(incident);
  if (precision === "county" || precision === "road") return null;
  const reach = bufferKm + PRECISION_SLACK_KM[precision];
  // Cheap reject before walking every segment: a degree is ~111 km.
  const pad = reach / KM_PER_DEG;
  const b = route.bbox;
  const padLng = pad / Math.max(route.cosLat, 0.1);
  if (
    incident.lat < b.minLat - pad || incident.lat > b.maxLat + pad ||
    incident.lng < b.minLng - padLng || incident.lng > b.maxLng + padLng
  ) {
    return null;
  }
  const { offRouteKm, alongKm } = locateOnRoute(route, incident.lat, incident.lng);
  if (offRouteKm > reach) return null;
  return { incident, precision, offRouteKm, alongKm };
}

export function matchRoute(route: PreparedRoute, incidents: Incident[], opts: RouteMatchOptions): RouteMatches {
  const along: RouteMatch[] = [];
  const inCounties: Incident[] = [];
  const counties = new Set(opts.counties);
  for (const incident of incidents) {
    if (!inGroup(incident, opts.group) || !recent(incident, opts.nowMs, opts.windowHours)) continue;
    const match = matchIncident(route, incident, opts.bufferKm);
    if (match) along.push(match);
    else if (NOT_PINNABLE.has(precisionOf(incident)) && counties.has(incident.county)) inCounties.push(incident);
  }
  along.sort((a, b) => a.alongKm - b.alongKm);
  inCounties.sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt));
  return { along, inCounties };
}

/** How to say where an incident's point is, given what it stands for. */
export function placementLabel(match: Pick<RouteMatch, "precision" | "offRouteKm">, locationName: string): string {
  const off = match.offRouteKm < 0.5 ? "on or beside your route" : `${formatKm(match.offRouteKm)} from your route`;
  switch (match.precision) {
    case "local":
      return `${locationName} · ${off}`;
    case "town":
      return `${locationName} (town-level location) · ${off}`;
    case "road":
      return `Somewhere along ${locationName} · exact spot unknown`;
    case "area":
      return `${locationName} area (approximate) · ${off}`;
  }
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

// --- saved routes -------------------------------------------------------------

export interface SavedRoute {
  id: string;
  from: RoutePlace;
  to: RoutePlace;
  /** Simplified geometry: enough to match against, small enough to persist. */
  coords: LatLng[];
  counties: string[];
  bufferKm: number;
  group: RouteIncidentGroup;
  alerts: boolean;
  /** Absent on routes saved before walking was offered: those are driving. */
  mode?: TravelMode;
}

/** Tolerance for a saved route's stored line: 100 m off the real road is well
 * inside the narrowest corridor, and cuts a long route to a few hundred points. */
export const SAVED_ROUTE_TOLERANCE_KM = 0.1;

export function routeName(r: { from: RoutePlace; to: RoutePlace }): string {
  return `${r.from.name} → ${r.to.name}`;
}

const preparedCache = new WeakMap<LatLng[], PreparedRoute>();

function prepared(coords: LatLng[]): PreparedRoute {
  let p = preparedCache.get(coords);
  if (!p) {
    p = prepareRoute(coords);
    preparedCache.set(coords, p);
  }
  return p;
}

/** The first saved route with alerts on that an incident falls along, with
 * where on it. County-level reports never alert: "somewhere in Nakuru" is
 * not news about a road through it. */
export function savedRouteHit(
  incident: Incident,
  routes: readonly SavedRoute[]
): { route: SavedRoute; match: RouteMatch } | null {
  for (const route of routes) {
    if (!route.alerts || !inGroup(incident, route.group)) continue;
    const match = matchIncident(prepared(route.coords), incident, route.bufferKm);
    if (match) return { route, match };
  }
  return null;
}

// --- trips --------------------------------------------------------------------
//
// While someone is travelling the route with the page open, their position
// says which incidents are still ahead. Foreground only: the browser stops
// reporting position when the page is closed.

/** Off the route by more than this and the position no longer says where on
 * it someone is (a different road, or a very poor fix). */
export const OFF_ROUTE_KM = 1.5;
/** An incident this far behind still counts as ahead: a fix can lag, and a
 * report's point is only so precise. */
const PASSED_SLACK_KM = 0.3;

export interface TripProgress {
  alongKm: number;
  offRouteKm: number;
  onRoute: boolean;
  ahead: RouteMatch[];
  passed: RouteMatch[];
}

export function tripProgress(route: PreparedRoute, matches: RouteMatch[], lat: number, lng: number): TripProgress {
  const { alongKm, offRouteKm } = locateOnRoute(route, lat, lng);
  const onRoute = offRouteKm <= OFF_ROUTE_KM;
  // Off the route, nothing can honestly be called passed.
  const isPassed = (m: RouteMatch) => onRoute && m.alongKm < alongKm - PASSED_SLACK_KM;
  return {
    alongKm,
    offRouteKm,
    onRoute,
    ahead: matches.filter((m) => !isPassed(m)),
    passed: matches.filter(isPassed),
  };
}

/** Incidents ahead to warn about now: ones within `approachKm` not yet warned
 * about, and ones reported since the trip started, wherever ahead they are. */
export function tripAlerts(
  progress: TripProgress,
  approachKm: number,
  warned: ReadonlySet<string>,
  knownAtStart: ReadonlySet<string>
): { match: RouteMatch; reason: "approaching" | "new" }[] {
  if (!progress.onRoute) return [];
  const out: { match: RouteMatch; reason: "approaching" | "new" }[] = [];
  for (const m of progress.ahead) {
    if (warned.has(m.incident.id)) continue;
    if (!knownAtStart.has(m.incident.id)) out.push({ match: m, reason: "new" });
    else if (m.alongKm - progress.alongKm <= approachKm) out.push({ match: m, reason: "approaching" });
  }
  return out;
}
