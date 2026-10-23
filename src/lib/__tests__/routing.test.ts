import { describe, expect, it } from "vitest";
import { orsRequestBody, parseOrs, parseOsrm } from "@/lib/routing";

const LINE: [number, number][] = [
  [36.8219, -1.2864],
  [36.9, -1.2],
  [37.0693, -1.0333],
];

describe("openrouteservice", () => {
  it("sends [lng, lat] and asks for alternatives only on shorter trips", () => {
    const short = orsRequestBody([-1.2864, 36.8219], [-1.0333, 37.0693]); // Nairobi–Thika, ~40 km
    expect(short.coordinates).toEqual([
      [36.8219, -1.2864],
      [37.0693, -1.0333],
    ]);
    expect(short.alternative_routes).toMatchObject({ target_count: 3 });
    // Nairobi–Mombasa: ORS rejects alternatives over 100 km of road.
    expect(orsRequestBody([-1.2864, 36.8219], [-4.0547, 39.6636]).alternative_routes).toBeUndefined();
  });

  it("reads routes from a GeoJSON answer, as [lat, lng] in km and minutes", () => {
    const r = parseOrs(200, {
      type: "FeatureCollection",
      features: [{ geometry: { coordinates: LINE }, properties: { summary: { distance: 43716, duration: 2094 } } }],
    });
    expect(r.kind).toBe("routes");
    if (r.kind !== "routes") return;
    expect(r.routes[0].distanceKm).toBe(43.7);
    expect(r.routes[0].durationMin).toBe(35);
    expect(r.routes[0].coords[0]).toEqual([-1.2864, 36.8219]);
  });

  it("treats 'no route' as final and anything else going wrong as a reason to fall back", () => {
    expect(parseOrs(404, { error: { code: 2009, message: "Route could not be found" } }).kind).toBe("no-route");
    expect(parseOrs(429, { error: "Rate limit exceeded" }).kind).toBe("failed");
    expect(parseOrs(403, { error: "Access to this API has been disallowed" }).kind).toBe("failed");
    expect(parseOrs(500, null).kind).toBe("failed");
  });
});

describe("OSRM", () => {
  it("reads routes and no-route answers", () => {
    const ok = parseOsrm(200, { code: "Ok", routes: [{ distance: 43716, duration: 2094, geometry: { coordinates: LINE } }] });
    expect(ok.kind === "routes" && ok.routes[0].distanceKm).toBe(43.7);
    expect(parseOsrm(400, { code: "NoRoute" }).kind).toBe("no-route");
    expect(parseOsrm(502, null).kind).toBe("failed");
  });
});
