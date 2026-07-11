import { describe, expect, it } from "vitest";
import { findSimilarIncidents, haversineDistanceKm } from "@/lib/geo";
import { makeIncident, hoursBeforeReference } from "./test-utils";

describe("haversineDistanceKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceKm([-1.29, 36.82], [-1.29, 36.82])).toBe(0);
  });

  it("computes Nairobi–Mombasa at roughly 440 km", () => {
    const nairobi: [number, number] = [-1.2905, 36.8771];
    const mombasa: [number, number] = [-4.0269, 39.6556];
    const d = haversineDistanceKm(nairobi, mombasa);
    expect(d).toBeGreaterThan(420);
    expect(d).toBeLessThan(460);
  });

  it("is symmetric", () => {
    const a: [number, number] = [0.5, 35.2];
    const b: [number, number] = [-3.2, 40.1];
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10);
  });
});

describe("findSimilarIncidents", () => {
  const target = makeIncident({
    id: "target",
    lat: -1.29,
    lng: 36.82,
    category: "crime",
    reportedAt: hoursBeforeReference(1),
  });

  it("excludes the target itself", () => {
    expect(findSimilarIncidents(target, [target])).toEqual([]);
  });

  it("excludes incidents farther than 8 km", () => {
    const far = makeIncident({ lat: -4.0, lng: 39.6, reportedAt: hoursBeforeReference(1) });
    expect(findSimilarIncidents(target, [target, far])).toEqual([]);
  });

  it("includes nearby incidents within 72 hours regardless of category", () => {
    const near = makeIncident({
      lat: -1.291,
      lng: 36.821,
      category: "fire",
      reportedAt: hoursBeforeReference(10),
    });
    expect(findSimilarIncidents(target, [target, near])).toEqual([near]);
  });

  it("includes old nearby incidents only when the category matches", () => {
    const oldSameCat = makeIncident({
      lat: -1.291,
      lng: 36.821,
      category: "crime",
      reportedAt: hoursBeforeReference(24 * 20),
    });
    const oldOtherCat = makeIncident({
      lat: -1.291,
      lng: 36.821,
      category: "fire",
      reportedAt: hoursBeforeReference(24 * 20),
    });
    expect(findSimilarIncidents(target, [target, oldSameCat, oldOtherCat])).toEqual([
      oldSameCat,
    ]);
  });

  it("sorts by distance and respects maxResults", () => {
    const closest = makeIncident({ lat: -1.2901, lng: 36.8201, reportedAt: hoursBeforeReference(1) });
    const mid = makeIncident({ lat: -1.3, lng: 36.83, reportedAt: hoursBeforeReference(1) });
    const farthest = makeIncident({ lat: -1.32, lng: 36.85, reportedAt: hoursBeforeReference(1) });
    const all = [target, farthest, closest, mid];

    expect(findSimilarIncidents(target, all)).toEqual([closest, mid, farthest]);
    expect(findSimilarIncidents(target, all, 2)).toEqual([closest, mid]);
  });
});
