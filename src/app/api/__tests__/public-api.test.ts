import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as listIncidents } from "../incidents/route";
import { GET as getIncident } from "../incidents/[id]/route";
import { GET as listReports } from "../monthly-reports/route";
import { GET as getReport } from "../monthly-reports/[month]/route";
import { GET as openApi } from "../openapi.json/route";
import { API_ENDPOINTS, openApiSpec } from "@/lib/api-spec";
import { cacheControl } from "@/lib/api-response";
import nextConfig from "../../../../next.config";

function req(path: string) {
  return new NextRequest(new URL(path, "http://localhost"));
}

describe("public API caching", () => {
  it("lets the edge cache successful reads briefly", async () => {
    const res = await listIncidents(req("/api/incidents?limit=1"));
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });

  it("never caches an error", async () => {
    const bad = await listIncidents(req("/api/incidents?limit=0"));
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("no-store");
    const missing = await getIncident(req("/api/incidents/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  it("builds cache headers from one rule", () => {
    expect(cacheControl(600, true)).toBe("public, s-maxage=600, stale-while-revalidate=3000");
    expect(cacheControl(600, false)).toBe("no-store");
    expect(cacheControl(undefined, true)).toBe("no-store");
  });
});

describe("cross-origin access", () => {
  it("opens reads, not writes, to any website", async () => {
    const rules = await nextConfig.headers!();
    const api = rules.find((r) => r.source === "/api/:path*")!;
    const header = (key: string) => api.headers.find((h) => h.key === key)?.value;
    expect(header("Access-Control-Allow-Origin")).toBe("*");
    expect(header("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
  });
});

describe("GET /api/monthly-reports", () => {
  it("lists the bundled September report", async () => {
    const res = await listReports();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.map((r: { month: string }) => r.month)).toContain("2026-09");
    expect(res.headers.get("cache-control")).toContain("s-maxage=600");
  });

  it("serves one report, and rejects bad or unknown months", async () => {
    const ok = await getReport(req("/api/monthly-reports/2026-09"), { params: Promise.resolve({ month: "2026-09" }) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).events).toHaveLength(105);
    const bad = await getReport(req("/api/monthly-reports/sept"), { params: Promise.resolve({ month: "sept" }) });
    expect(bad.status).toBe(400);
    const missing = await getReport(req("/api/monthly-reports/2020-01"), { params: Promise.resolve({ month: "2020-01" }) });
    expect(missing.status).toBe(404);
  });
});

describe("GET /api/openapi.json", () => {
  it("describes every documented endpoint", async () => {
    const spec = await (await openApi()).json();
    expect(spec.openapi).toBe("3.1.0");
    for (const ep of API_ENDPOINTS) {
      expect(spec.paths[ep.path][ep.method.toLowerCase()].operationId).toBe(ep.id);
    }
  });

  it("documents a route for every endpoint path", () => {
    // Every {param} in a documented path must be declared as a path parameter.
    for (const ep of API_ENDPOINTS) {
      const declared = ep.params.filter((p) => p.in === "path").map((p) => p.name).sort();
      const inPath = [...ep.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(declared, ep.path).toEqual(inPath);
    }
    expect(Object.keys(openApiSpec().paths)).toHaveLength(new Set(API_ENDPOINTS.map((e) => e.path)).size);
  });
});
