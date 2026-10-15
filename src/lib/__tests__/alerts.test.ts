import { describe, expect, it } from "vitest";
import {
  ALERT_MAX_AGE_HOURS,
  canSeedAlerts,
  matchesSubscription,
  newIncidents,
  recentEnoughToAlert,
  wantsBackgroundAlerts,
} from "@/lib/alerts";
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


describe("which incidents may alert", () => {
  const NOW = Date.parse("2026-10-07T20:00:00Z");
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

  it("never alerts about an incident older than a day", () => {
    expect(recentEnoughToAlert(incident({ reportedAt: hoursAgo(2) }), NOW)).toBe(true);
    expect(recentEnoughToAlert(incident({ reportedAt: hoursAgo(ALERT_MAX_AGE_HOURS) }), NOW)).toBe(true);
    expect(recentEnoughToAlert(incident({ reportedAt: hoursAgo(24 * 60) }), NOW)).toBe(false);
  });

  it("in api mode, waits for polled data before remembering what is there", () => {
    expect(canSeedAlerts({ polled: false }, true)).toBe(false);
    expect(canSeedAlerts({ polled: true }, true)).toBe(true);
    // mock mode never polls; its one snapshot is the real (sample) data
    expect(canSeedAlerts({ polled: false }, false)).toBe(true);
  });

  it("replays the bug: sample data first, then real data, raises nothing", () => {
    const sample = { polled: false, incidents: [incident({ id: "ow-1" }), incident({ id: "ow-2" })] };
    const real = {
      polled: true,
      incidents: [incident({ id: "ing-old", reportedAt: hoursAgo(24 * 60) }), incident({ id: "ing-new", reportedAt: hoursAgo(1) })],
    };
    let seen: Set<string> | null = null;
    const alerts: string[] = [];
    for (const snap of [sample, real]) {
      if (!canSeedAlerts(snap, true)) continue;
      if (seen === null) {
        seen = new Set(snap.incidents.map((i) => i.id));
        continue;
      }
      alerts.push(...newIncidents(snap.incidents, seen).map((i) => i.id));
    }
    expect(alerts).toEqual([]);
    expect(seen).toEqual(new Set(["ing-old", "ing-new"]));
  });
});

describe("wantsBackgroundAlerts", () => {
  const counties = subscription({ counties: ["Nairobi"] });

  it("keeps a hidden tab polling only for a reader a desktop notification can reach", () => {
    expect(wantsBackgroundAlerts(counties, false, "granted")).toBe(true);
    // Saved route alerts count as asking, even with no subscription set up.
    expect(wantsBackgroundAlerts(subscription(), true, "granted")).toBe(true);
  });

  it("stops for everyone else", () => {
    expect(wantsBackgroundAlerts(counties, false, "default")).toBe(false);
    expect(wantsBackgroundAlerts(counties, false, null)).toBe(false);
    expect(wantsBackgroundAlerts(subscription(), false, "granted")).toBe(false);
    const pushOff = subscription({ counties: ["Nairobi"], channels: { push: false, sms: false, email: false } });
    expect(wantsBackgroundAlerts(pushOff, true, "granted")).toBe(false);
  });
});
