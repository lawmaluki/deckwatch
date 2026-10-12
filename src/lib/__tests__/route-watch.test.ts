import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import {
  countiesAlongRoute,
  locateOnRoute,
  matchRoute,
  placementLabel,
  precisionOf,
  prepareRoute,
  savedRouteHit,
  simplifyRoute,
  type LatLng,
  type SavedRoute,
} from "@/lib/route-watch";
import { COUNTY_BY_NAME } from "@/lib/data/counties";
import { DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { hoursBeforeReference, makeIncident } from "./test-utils";

// A straight north-east line of ~44 km, roughly Nairobi CBD to Thika.
const NAIROBI: LatLng = [-1.2864, 36.8219];
const THIKA: LatLng = [-1.0333, 37.0693];
const LINE: LatLng[] = Array.from({ length: 11 }, (_, i) => [
  NAIROBI[0] + ((THIKA[0] - NAIROBI[0]) * i) / 10,
  NAIROBI[1] + ((THIKA[1] - NAIROBI[1]) * i) / 10,
]);
const ROUTE = prepareRoute(LINE);
const NOW = DATA_REFERENCE_TIME.getTime();
const OPTS = { bufferKm: 2, windowHours: 48, group: "all" as const, nowMs: NOW, counties: ["Nairobi", "Kiambu"] };

/** A point `offKm` to the side of the line, `t` of the way along it. */
function beside(t: number, offKm: number): { lat: number; lng: number } {
  const lat = NAIROBI[0] + (THIKA[0] - NAIROBI[0]) * t;
  const lng = NAIROBI[1] + (THIKA[1] - NAIROBI[1]) * t;
  // Perpendicular to a 45° line: step north-west.
  const d = offKm / 111.32 / Math.SQRT2;
  return { lat: lat + d, lng: lng - d };
}

describe("route geometry", () => {
  it("measures distance from the line and along it", () => {
    expect(ROUTE.lengthKm).toBeGreaterThan(38);
    expect(ROUTE.lengthKm).toBeLessThan(42);
    const p = beside(0.5, 1.5);
    const { offRouteKm, alongKm } = locateOnRoute(ROUTE, p.lat, p.lng);
    expect(offRouteKm).toBeCloseTo(1.5, 1);
    expect(alongKm).toBeCloseTo(ROUTE.lengthKm / 2, 0);
  });

  it("simplifies a straight line to its ends", () => {
    expect(simplifyRoute(LINE, 0.1)).toEqual([LINE[0], LINE[10]]);
  });
});

describe("matchRoute", () => {
  it("orders incidents by where the route meets them, not by time", () => {
    const late = makeIncident({ ...beside(0.8, 0.3), locationPrecision: "local", reportedAt: hoursBeforeReference(1) });
    const early = makeIncident({ ...beside(0.2, 0.3), locationPrecision: "local", reportedAt: hoursBeforeReference(10) });
    const { along } = matchRoute(ROUTE, [late, early], OPTS);
    expect(along.map((m) => m.incident.id)).toEqual([early.id, late.id]);
  });

  it("leaves out incidents outside the corridor, too old, or of another kind", () => {
    const far = makeIncident({ ...beside(0.5, 4), locationPrecision: "local" });
    const old = makeIncident({ ...beside(0.5, 0.2), locationPrecision: "local", reportedAt: hoursBeforeReference(72) });
    const flood = makeIncident({ ...beside(0.5, 0.2), locationPrecision: "local", category: "flood" });
    expect(matchRoute(ROUTE, [far, old], OPTS).along).toEqual([]);
    expect(matchRoute(ROUTE, [flood], { ...OPTS, group: "security" }).along).toEqual([]);
    expect(matchRoute(ROUTE, [flood], { ...OPTS, group: "weather" }).along).toHaveLength(1);
  });

  it("gives a town-level point extra reach, since it is only the town's centre", () => {
    const town = makeIncident({ ...beside(0.5, 3.5), locationPrecision: "town" });
    const spot = makeIncident({ ...beside(0.5, 3.5), locationPrecision: "local" });
    const ids = matchRoute(ROUTE, [town, spot], OPTS).along.map((m) => m.incident.id);
    expect(ids).toEqual([town.id]);
  });

  it("never pins a county-level report on the route, but lists it for counties crossed", () => {
    const centre = COUNTY_BY_NAME["Kiambu"].center;
    const vague = makeIncident({ county: "Kiambu", lat: centre[0], lng: centre[1], locationPrecision: "county" });
    const elsewhere = makeIncident({ county: "Mombasa", lat: -4.05, lng: 39.66, locationPrecision: "county" });
    const { along, inCounties } = matchRoute(ROUTE, [vague, elsewhere], OPTS);
    expect(along).toEqual([]);
    expect(inCounties.map((i) => i.id)).toEqual([vague.id]);
  });

  it("treats an incident at its county centre with no stored precision as county-level", () => {
    const centre = COUNTY_BY_NAME["Nairobi"].center;
    expect(precisionOf(makeIncident({ lat: centre[0], lng: centre[1] }))).toBe("county");
    expect(precisionOf(makeIncident({ lat: -1.2, lng: 36.9 }))).toBe("local");
  });
});

describe("placementLabel", () => {
  it("says a road point is only somewhere along the road", () => {
    expect(placementLabel({ precision: "road", offRouteKm: 0.2 }, "Thika Road")).toBe(
      "Somewhere along Thika Road · exact spot unknown"
    );
    expect(placementLabel({ precision: "town", offRouteKm: 1.234 }, "Juja")).toBe(
      "Juja (town-level location) · 1.2 km from your route"
    );
  });
});

describe("countiesAlongRoute", () => {
  const square = (name: string, x0: number, x1: number) => ({
    type: "Feature" as const,
    properties: { name },
    geometry: { type: "Polygon" as const, coordinates: [[[x0, -2], [x1, -2], [x1, 0], [x0, 0], [x0, -2]]] },
  });
  const counties: FeatureCollection = {
    type: "FeatureCollection",
    features: [square("West", 36, 36.9), square("East", 36.9, 38), square("Far", 39, 40)],
  };

  it("lists the counties crossed in the order the route enters them", () => {
    expect(countiesAlongRoute(LINE, counties)).toEqual(["West", "East"]);
  });
});

describe("savedRouteHit", () => {
  const saved: SavedRoute = {
    id: "r1",
    from: { name: "Nairobi CBD", county: "Nairobi", lat: NAIROBI[0], lng: NAIROBI[1] },
    to: { name: "Thika", county: "Kiambu", lat: THIKA[0], lng: THIKA[1] },
    coords: LINE,
    counties: ["Nairobi", "Kiambu"],
    bufferKm: 2,
    group: "all",
    alerts: true,
  };

  it("finds the saved route an incident falls along", () => {
    const hit = savedRouteHit(makeIncident({ ...beside(0.5, 0.5), locationPrecision: "local" }), [saved]);
    expect(hit?.route.id).toBe("r1");
  });

  it("stays quiet for routes with alerts off and for county-level reports", () => {
    const near = makeIncident({ ...beside(0.5, 0.5), locationPrecision: "local" });
    expect(savedRouteHit(near, [{ ...saved, alerts: false }])).toBeNull();
    const vague = makeIncident({ ...beside(0.5, 0.5), locationPrecision: "county" });
    expect(savedRouteHit(vague, [saved])).toBeNull();
  });
});
