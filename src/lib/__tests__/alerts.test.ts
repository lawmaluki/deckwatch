import { describe, expect, it } from "vitest";
import { matchesSubscription, newIncidents } from "@/lib/alerts";
import type { NotificationSubscription } from "@/store/useAppStore";
import type { Incident } from "@/lib/types";

const NAIROBI_CBD = { lat: -1.2864, lng: 36.8172 };

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "ow-1",
    title: "Armed robbery at Eastleigh",
    category: "crime",
    severity: "high",
    county: "Nairobi",
    locationName: "Eastleigh",
    lat: NAIROBI_CBD.lat,
    lng: NAIROBI_CBD.lng,
    reportedAt: "2026-07-02T08:00:00.000Z",
    verificationScore: 70,
    verificationStatus: "likely_true",
    sources: [],
    reportCount: 1,
    aiSummary: "",
    recommendedActions: [],
    hasImage: false,
    isCitizenReport: false,
    isLive: true,
    ...overrides,
  } as Incident;
}

function subscription(
  overrides: Partial<NotificationSubscription> = {}
): NotificationSubscription {
  return {
    counties: [],
    categories: [],
    radiusKm: 10,
    useLocation: false,
    channels: { push: true, sms: false, email: false },
    ...overrides,
  };
}

describe("matchesSubscription", () => {
  it("matches everything when nothing is narrowed", () => {
    expect(matchesSubscription(incident(), subscription(), null)).toBe(true);
  });

  it("filters on category when categories are chosen", () => {
    const sub = subscription({ categories: ["flood"] });
    expect(matchesSubscription(incident({ category: "crime" }), sub, null)).toBe(false);
    expect(matchesSubscription(incident({ category: "flood" }), sub, null)).toBe(true);
  });

  it("filters on county when counties are chosen", () => {
    const sub = subscription({ counties: ["Mombasa"] });
    expect(matchesSubscription(incident({ county: "Nairobi" }), sub, null)).toBe(false);
    expect(matchesSubscription(incident({ county: "Mombasa" }), sub, null)).toBe(true);
  });

  it("requires both when county and category are chosen", () => {
    const sub = subscription({ counties: ["Nairobi"], categories: ["flood"] });
    expect(matchesSubscription(incident({ category: "crime" }), sub, null)).toBe(false);
  });

  it("matches inside the radius and not outside it", () => {
    const sub = subscription({ useLocation: true, radiusKm: 5 });
    // ~2km north of the origin.
    const near = incident({ lat: NAIROBI_CBD.lat + 0.018, lng: NAIROBI_CBD.lng });
    const far = incident({ lat: NAIROBI_CBD.lat + 0.5, lng: NAIROBI_CBD.lng });
    expect(matchesSubscription(near, sub, NAIROBI_CBD)).toBe(true);
    expect(matchesSubscription(far, sub, NAIROBI_CBD)).toBe(false);
  });

  it("treats county and radius as alternatives, not a narrowing", () => {
    const sub = subscription({
      counties: ["Mombasa"],
      useLocation: true,
      radiusKm: 5,
    });
    // In Nairobi — wrong county, but standing right next to it.
    expect(matchesSubscription(incident(), sub, NAIROBI_CBD)).toBe(true);
    // In Mombasa — right county, far from here.
    const mombasa = incident({ county: "Mombasa", lat: -4.05, lng: 39.67 });
    expect(matchesSubscription(mombasa, sub, NAIROBI_CBD)).toBe(true);
  });

  it("ignores the radius when location is off or unavailable", () => {
    const off = subscription({ counties: ["Mombasa"], useLocation: false, radiusKm: 5 });
    expect(matchesSubscription(incident(), off, NAIROBI_CBD)).toBe(false);

    const denied = subscription({ counties: ["Mombasa"], useLocation: true });
    expect(matchesSubscription(incident(), denied, null)).toBe(false);
  });
});

describe("newIncidents", () => {
  it("returns only ids not already seen", () => {
    const a = incident({ id: "a" });
    const b = incident({ id: "b" });
    expect(newIncidents([a, b], new Set(["a"]))).toEqual([b]);
    expect(newIncidents([a, b], new Set(["a", "b"]))).toEqual([]);
  });
});
