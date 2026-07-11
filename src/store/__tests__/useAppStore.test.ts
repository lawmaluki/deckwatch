import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/store/useAppStore";

const initial = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initial, true);
});

describe("useAppStore filters", () => {
  it("toggleCategory adds then removes", () => {
    useAppStore.getState().toggleCategory("crime");
    expect(useAppStore.getState().activeCategories).toEqual(["crime"]);
    useAppStore.getState().toggleCategory("crime");
    expect(useAppStore.getState().activeCategories).toEqual([]);
  });

  it("toggleSeverity and toggleVerification behave the same way", () => {
    useAppStore.getState().toggleSeverity("high");
    useAppStore.getState().toggleVerification("verified");
    expect(useAppStore.getState().activeSeverities).toEqual(["high"]);
    expect(useAppStore.getState().activeVerification).toEqual(["verified"]);
  });

  it("resetFilters clears filters but not selection or timeline", () => {
    const s = useAppStore.getState();
    s.toggleCategory("fire");
    s.setCountyFilter("Nairobi");
    s.setSearchQuery("floods");
    s.selectIncident("ow-0001");
    s.setTimelineMode(true);

    useAppStore.getState().resetFilters();
    const after = useAppStore.getState();
    expect(after.activeCategories).toEqual([]);
    expect(after.countyFilter).toBeNull();
    expect(after.searchQuery).toBe("");
    expect(after.selectedIncidentId).toBe("ow-0001");
    expect(after.timelineMode).toBe(true);
  });
});

describe("useAppStore timeline", () => {
  it("entering timeline mode resets cursor and stops playback", () => {
    const s = useAppStore.getState();
    s.setTimelineCursor(0.4);
    s.setTimelinePlaying(true);
    s.setTimelineMode(true);

    const after = useAppStore.getState();
    expect(after.timelineMode).toBe(true);
    expect(after.timelineCursor).toBe(1);
    expect(after.timelinePlaying).toBe(false);
  });

  it("changing range resets the cursor", () => {
    useAppStore.getState().setTimelineCursor(0.2);
    useAppStore.getState().setTimelineRange(168);
    expect(useAppStore.getState().timelineRange).toBe(168);
    expect(useAppStore.getState().timelineCursor).toBe(1);
  });
});

describe("useAppStore notifications", () => {
  it("updateNotifications merges partial updates", () => {
    useAppStore.getState().updateNotifications({ radiusKm: 25 });
    const n = useAppStore.getState().notifications;
    expect(n.radiusKm).toBe(25);
    expect(n.channels.push).toBe(true); // untouched defaults survive
  });
});
