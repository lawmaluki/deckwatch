import { describe, it, expect, vi, afterEach } from "vitest";
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
      // Normalize the one field that is expected to differ, then compare the rest.
      expect({ ...incident, reportedAt: "" }).toEqual({
        ...snapshot[i],
        reportedAt: "",
      });
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

// getIncidents() reads USE_API/BACKEND_URL as module-level constants frozen
// at import time, so each case resets the module registry and re-stubs env
// before a fresh dynamic import, rather than mutating process.env in place.
describe("getIncidents (server, api mode)", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("filters to live incidents when the backend responds", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("API_BASE_URL", "https://backend.example");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: "a", isLive: true },
          { id: "b", isLive: false },
        ],
      }),
    }) as unknown as typeof fetch;

    const { getIncidents } = await import("@/lib/incidents-source");
    const incidents = await getIncidents();
    expect(incidents.map((i) => i.id)).toEqual(["a"]);
  });

  it("falls back to the seed dataset when the backend is unreachable", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("API_BASE_URL", "https://backend.example");
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { getIncidents } = await import("@/lib/incidents-source");
    const incidents = await getIncidents();
    expect(incidents.length).toBeGreaterThan(0);
  });

  it("skips the backend entirely outside api mode", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "");
    vi.stubEnv("API_BASE_URL", "https://backend.example");
    global.fetch = vi.fn();

    const { getIncidents } = await import("@/lib/incidents-source");
    await getIncidents();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
