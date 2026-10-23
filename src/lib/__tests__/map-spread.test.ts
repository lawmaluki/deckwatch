import { describe, expect, it } from "vitest";
import { groupByPoint, ringOffsets } from "@/lib/map-spread";
import { useAppStore } from "@/store/useAppStore";

describe("groupByPoint", () => {
  it("groups items on the same point and keeps the rest apart", () => {
    const a = { id: "a", lat: -1.2864, lng: 36.8172 };
    const b = { id: "b", lat: -1.28641, lng: 36.81721 }; // same point to ~11 m
    const c = { id: "c", lat: -0.0917, lng: 34.768 };
    expect(groupByPoint([a, c, b]).map((g) => g.map((x) => x.id))).toEqual([["a", "b"], ["c"]]);
  });
});

describe("ringOffsets", () => {
  it("leaves a lone dot where it is", () => {
    expect(ringOffsets(1)).toEqual([[0, 0]]);
  });

  it("spreads shared dots so no two overlap", () => {
    for (const n of [2, 5, 12]) {
      const offsets = ringOffsets(n);
      expect(offsets).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const [dx, dy] = [offsets[i][0] - offsets[j][0], offsets[i][1] - offsets[j][1]];
          expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(16); // a dot's width
        }
      }
    }
  });
});

describe("today mode", () => {
  it("is left whenever the filters are reset, e.g. from a dashboard click", () => {
    useAppStore.getState().setTodayMode(true);
    useAppStore.getState().resetFilters();
    expect(useAppStore.getState().todayMode).toBe(false);
  });
});
