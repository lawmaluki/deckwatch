import { describe, expect, it } from "vitest";
import {
  categoryBreakdown,
  countyRiskScore,
  dailyTrend,
  hoursAgo,
  riskLabel,
  summarizeByCounty,
  withinHours,
} from "@/lib/stats";
import { makeIncident, hoursBeforeReference } from "./test-utils";

describe("hoursAgo / withinHours", () => {
  it("computes hours relative to the fixed reference time", () => {
    const incident = makeIncident({ reportedAt: hoursBeforeReference(5) });
    expect(hoursAgo(incident)).toBeCloseTo(5, 5);
  });

  it("withinHours is inclusive at the boundary", () => {
    const incident = makeIncident({ reportedAt: hoursBeforeReference(24) });
    expect(withinHours(incident, 24)).toBe(true);
    expect(withinHours(incident, 23)).toBe(false);
  });
});

describe("countyRiskScore", () => {
  it("returns 0 for no incidents", () => {
    expect(countyRiskScore([])).toBe(0);
  });

  it("scores recent critical incidents higher than old low ones", () => {
    const critical = [
      makeIncident({ severity: "critical", reportedAt: hoursBeforeReference(1) }),
    ];
    const low = [
      makeIncident({ severity: "low", reportedAt: hoursBeforeReference(24 * 25) }),
    ];
    expect(countyRiskScore(critical)).toBeGreaterThan(countyRiskScore(low));
  });

  it("is capped at 100 and always an integer", () => {
    const many = Array.from({ length: 500 }, () =>
      makeIncident({ severity: "critical", reportedAt: hoursBeforeReference(1) })
    );
    const score = countyRiskScore(many);
    expect(score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(score)).toBe(true);
  });

  it("more incidents never lowers the score", () => {
    const base = [makeIncident({ severity: "high", reportedAt: hoursBeforeReference(2) })];
    const more = [
      ...base,
      makeIncident({ severity: "high", reportedAt: hoursBeforeReference(3) }),
    ];
    expect(countyRiskScore(more)).toBeGreaterThanOrEqual(countyRiskScore(base));
  });
});

describe("riskLabel", () => {
  it("maps scores to the four bands at exact thresholds", () => {
    expect(riskLabel(0).label).toBe("Low");
    expect(riskLabel(14).label).toBe("Low");
    expect(riskLabel(15).label).toBe("Moderate");
    expect(riskLabel(39).label).toBe("Moderate");
    expect(riskLabel(40).label).toBe("High");
    expect(riskLabel(69).label).toBe("High");
    expect(riskLabel(70).label).toBe("Critical");
    expect(riskLabel(100).label).toBe("Critical");
  });
});

describe("summarizeByCounty", () => {
  it("groups incidents and finds the top category per county", () => {
    const incidents = [
      makeIncident({ county: "Nairobi", category: "crime" }),
      makeIncident({ county: "Nairobi", category: "crime" }),
      makeIncident({ county: "Nairobi", category: "fire" }),
      makeIncident({ county: "Mombasa", category: "flood" }),
    ];
    const summaries = summarizeByCounty(incidents);
    const nairobi = summaries.find((s) => s.county === "Nairobi");
    const mombasa = summaries.find((s) => s.county === "Mombasa");

    expect(summaries).toHaveLength(2);
    expect(nairobi?.total).toBe(3);
    expect(nairobi?.topCategory).toBe("crime");
    expect(mombasa?.total).toBe(1);
    expect(mombasa?.topCategory).toBe("flood");
  });

  it("counts last24h correctly", () => {
    const incidents = [
      makeIncident({ county: "Nairobi", reportedAt: hoursBeforeReference(2) }),
      makeIncident({ county: "Nairobi", reportedAt: hoursBeforeReference(48) }),
    ];
    const [summary] = summarizeByCounty(incidents);
    expect(summary.last24h).toBe(1);
    expect(summary.total).toBe(2);
  });
});

describe("categoryBreakdown", () => {
  it("counts categories and sorts descending", () => {
    const incidents = [
      makeIncident({ category: "fire" }),
      makeIncident({ category: "crime" }),
      makeIncident({ category: "crime" }),
    ];
    expect(categoryBreakdown(incidents)).toEqual([
      { category: "crime", count: 2 },
      { category: "fire", count: 1 },
    ]);
  });

  it("returns an empty array for no incidents", () => {
    expect(categoryBreakdown([])).toEqual([]);
  });
});

describe("dailyTrend", () => {
  it("returns one bucket per day in chronological order", () => {
    const trend = dailyTrend([], 14);
    expect(trend).toHaveLength(14);
    const dates = trend.map((t) => t.date);
    expect([...dates].sort()).toEqual(dates);
    expect(trend.every((t) => t.count === 0)).toBe(true);
  });

  it("buckets incidents into the right day", () => {
    const incidents = [
      makeIncident({ reportedAt: hoursBeforeReference(1) }),
      makeIncident({ reportedAt: hoursBeforeReference(2) }),
      // Outside the window — should be ignored.
      makeIncident({ reportedAt: hoursBeforeReference(24 * 40) }),
    ];
    const trend = dailyTrend(incidents, 14);
    const total = trend.reduce((sum, t) => sum + t.count, 0);
    expect(total).toBe(2);
    expect(trend[trend.length - 1].count).toBe(2);
  });
});
