import { describe, it, expect } from "vitest";
import { shiftIncidents, getIncidentsSnapshot } from "@/lib/incidents-source";
import { DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { hoursAgo } from "@/lib/stats";

describe("shiftIncidents", () => {
  const snapshot = getIncidentsSnapshot();
  const nowMs = Date.parse("2027-03-15T18:30:00Z");
  const shifted = shiftIncidents(snapshot, nowMs);

  it("preserves length, order, and non-time fields", () => {
    expect(shifted).toHaveLength(snapshot.length);
    shifted.forEach((incident, i) => {
      const { reportedAt: _a, ...rest } = incident;
      const { reportedAt: _b, ...original } = snapshot[i];
      expect(rest).toEqual(original);
    });
  });

  it("moves every reportedAt by exactly nowMs - DATA_REFERENCE_TIME", () => {
    const delta = nowMs - DATA_REFERENCE_TIME.getTime();
    shifted.forEach((incident, i) => {
      expect(Date.parse(incident.reportedAt)).toBe(
        Date.parse(snapshot[i].reportedAt) + delta
      );
    });
  });

  it("keeps durations invariant: hoursAgo against the new anchor matches the original", () => {
    shifted.forEach((incident, i) => {
      expect(hoursAgo(incident, nowMs)).toBeCloseTo(hoursAgo(snapshot[i]), 6);
    });
  });

  it("does not mutate the input", () => {
    expect(Date.parse(snapshot[0].reportedAt)).toBeLessThan(
      DATA_REFERENCE_TIME.getTime() + 1
    );
  });
});
