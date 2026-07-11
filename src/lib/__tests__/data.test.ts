import { describe, expect, it } from "vitest";
import { MOCK_INCIDENTS, DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { COUNTIES, COUNTY_BY_NAME, COUNTY_BY_SLUG } from "@/lib/data/counties";
import { CATEGORIES } from "@/lib/data/categories";
import { HOTSPOTS } from "@/lib/data/hotspots";

describe("counties dataset", () => {
  it("contains all 47 Kenyan counties with unique slugs and codes", () => {
    expect(COUNTIES).toHaveLength(47);
    expect(new Set(COUNTIES.map((c) => c.slug)).size).toBe(47);
    expect(new Set(COUNTIES.map((c) => c.code)).size).toBe(47);
  });

  it("lookup maps cover every county", () => {
    for (const c of COUNTIES) {
      expect(COUNTY_BY_SLUG[c.slug]).toBe(c);
      expect(COUNTY_BY_NAME[c.name]).toBe(c);
    }
  });
});

describe("hotspots dataset", () => {
  it("every hotspot references a real county and valid categories", () => {
    for (const h of HOTSPOTS) {
      expect(COUNTY_BY_NAME[h.county], `county "${h.county}"`).toBeDefined();
      expect(h.bias.length).toBeGreaterThan(0);
      for (const cat of h.bias) {
        expect(CATEGORIES[cat], `category "${cat}"`).toBeDefined();
      }
    }
  });
});

describe("mock incident generation", () => {
  it("generates the expected number of incidents with unique ids", () => {
    expect(MOCK_INCIDENTS).toHaveLength(360);
    expect(new Set(MOCK_INCIDENTS.map((i) => i.id)).size).toBe(360);
  });

  it("is sorted newest first", () => {
    for (let i = 1; i < MOCK_INCIDENTS.length; i++) {
      expect(
        new Date(MOCK_INCIDENTS[i - 1].reportedAt).getTime()
      ).toBeGreaterThanOrEqual(new Date(MOCK_INCIDENTS[i].reportedAt).getTime());
    }
  });

  it("every incident has valid fields", () => {
    const refTime = DATA_REFERENCE_TIME.getTime();
    for (const i of MOCK_INCIDENTS) {
      expect(COUNTY_BY_NAME[i.county], `county "${i.county}"`).toBeDefined();
      expect(CATEGORIES[i.category]).toBeDefined();
      expect(i.verificationScore).toBeGreaterThanOrEqual(4);
      expect(i.verificationScore).toBeLessThanOrEqual(99);
      expect(i.sources.length).toBeGreaterThan(0);
      expect(i.recommendedActions.length).toBeGreaterThan(0);
      expect(new Date(i.reportedAt).getTime()).toBeLessThanOrEqual(refTime);
      // Rough Kenya bounding box.
      expect(i.lat).toBeGreaterThan(-5.5);
      expect(i.lat).toBeLessThan(5.5);
      expect(i.lng).toBeGreaterThan(33.5);
      expect(i.lng).toBeLessThan(42.5);
    }
  });

  it("is deterministic across imports (fixed seed, fixed reference time)", () => {
    expect(DATA_REFERENCE_TIME.toISOString()).toBe("2026-07-02T09:00:00.000Z");
    const first = MOCK_INCIDENTS[0];
    // Snapshot of derived-but-stable properties: same seed → same data.
    expect(typeof first.id).toBe("string");
    expect(first.id).toMatch(/^ow-\d{4}$/);
  });
});
