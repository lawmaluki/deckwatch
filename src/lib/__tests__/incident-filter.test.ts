import { describe, expect, it } from "vitest";
import { filterIncidents } from "@/lib/incident-filter";
import { DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { MS_PER_HOUR } from "@/lib/constants";
import { makeIncident, hoursBeforeReference } from "./test-utils";

const incidents = [
  makeIncident({
    id: "a",
    category: "crime",
    severity: "high",
    county: "Nairobi",
    title: "Armed robbery near the market",
    verificationStatus: "verified",
    reportedAt: hoursBeforeReference(2),
  }),
  makeIncident({
    id: "b",
    category: "flood",
    severity: "low",
    county: "Kisumu",
    title: "Rising water levels",
    verificationStatus: "unconfirmed",
    reportedAt: hoursBeforeReference(50),
  }),
  makeIncident({
    id: "c",
    category: "fire",
    severity: "critical",
    county: "Nairobi",
    title: "Market fire spreading",
    verificationStatus: "likely_true",
    reportedAt: hoursBeforeReference(10),
  }),
];

const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe("filterIncidents", () => {
  it("returns everything for an empty filter", () => {
    expect(filterIncidents(incidents, {})).toEqual(incidents);
  });

  it("filters by category (OR within the list)", () => {
    expect(ids(filterIncidents(incidents, { categories: ["crime", "fire"] }))).toEqual([
      "a",
      "c",
    ]);
  });

  it("treats an empty category list as no filter", () => {
    expect(filterIncidents(incidents, { categories: [] })).toHaveLength(3);
  });

  it("filters by severity and verification", () => {
    expect(ids(filterIncidents(incidents, { severities: ["critical"] }))).toEqual(["c"]);
    expect(ids(filterIncidents(incidents, { verification: ["verified"] }))).toEqual(["a"]);
  });

  it("filters by county", () => {
    expect(ids(filterIncidents(incidents, { county: "Nairobi" }))).toEqual(["a", "c"]);
    expect(filterIncidents(incidents, { county: null })).toHaveLength(3);
  });

  it("filters by recency window", () => {
    expect(ids(filterIncidents(incidents, { withinHours: 24 }))).toEqual(["a", "c"]);
  });

  it("matches free text against title, location, and county", () => {
    expect(ids(filterIncidents(incidents, { freeText: "MARKET" }))).toEqual(["a", "c"]);
    expect(ids(filterIncidents(incidents, { freeText: "kisumu" }))).toEqual(["b"]);
    expect(filterIncidents(incidents, { freeText: "no-match" })).toEqual([]);
  });

  it("filters by absolute time window (inclusive bounds)", () => {
    const end = DATA_REFERENCE_TIME.getTime() - 2 * MS_PER_HOUR;
    const start = DATA_REFERENCE_TIME.getTime() - 12 * MS_PER_HOUR;
    expect(ids(filterIncidents(incidents, { timeWindow: { start, end } }))).toEqual([
      "a",
      "c",
    ]);
  });

  it("combines criteria with AND semantics", () => {
    expect(
      ids(
        filterIncidents(incidents, {
          county: "Nairobi",
          severities: ["critical"],
          freeText: "fire",
        })
      )
    ).toEqual(["c"]);
  });
});
