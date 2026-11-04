import { afterEach, describe, expect, it, vi } from "vitest";

// Api mode with a backend, so the report source actually consults it.
vi.mock("@/lib/incidents-source", () => ({ USE_API: true }));
vi.mock("@/lib/backend", () => ({ BACKEND_URL: "https://backend.test" }));

const { getMonthlyReport, listMonthlyReports } = await import("@/lib/monthly-reports");

function backend(reports: Record<string, { method: string; events?: unknown[] }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const month = url.split("/").pop()!;
      if (month === "monthly-reports") {
        const results = Object.entries(reports).map(([m, r]) => ({ month: m, method: r.method, incidents: r.events?.length ?? 0 }));
        return new Response(JSON.stringify({ results }));
      }
      const r = reports[month];
      return r ? new Response(JSON.stringify({ month, events: [], ...r })) : new Response("{}", { status: 404 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("report source (api mode)", () => {
  it("prefers the bundled reviewed report over an automatic backend one", async () => {
    backend({ "2026-10": { method: "automatic", events: new Array(536) } });
    const report = await getMonthlyReport("2026-10");
    expect(report?.method).toBe("editorial");
    expect(report?.events).toHaveLength(192);
    const listed = (await listMonthlyReports()).find((r) => r.month === "2026-10");
    expect(listed).toMatchObject({ method: "editorial", incidents: 192 });
  });

  it("keeps the backend's report when it is reviewed too, or the bundle has none", async () => {
    backend({ "2026-10": { method: "editorial" }, "2026-11": { method: "automatic" } });
    expect((await getMonthlyReport("2026-10"))?.events).toHaveLength(0);
    expect((await getMonthlyReport("2026-11"))?.method).toBe("automatic");
  });
});
