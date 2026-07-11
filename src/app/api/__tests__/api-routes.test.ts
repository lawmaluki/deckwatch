import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getIncidentsRoute } from "@/app/api/incidents/route";
import { GET as getIncidentByIdRoute } from "@/app/api/incidents/[id]/route";
import { GET as getCountyRoute } from "@/app/api/counties/[slug]/route";
import { POST as postReportRoute } from "@/app/api/reports/route";
import { getIncidentsSnapshot } from "@/lib/incidents-source";
import type { Incident } from "@/lib/types";

function incidentsRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/incidents${query}`);
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function slugParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/incidents", () => {
  it("returns the full dataset with no params", async () => {
    const res = await getIncidentsRoute(incidentsRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    const snapshot = getIncidentsSnapshot();
    expect(body.count).toBe(snapshot.length);
    expect(body.results).toEqual(JSON.parse(JSON.stringify(snapshot)));
  });

  it("filters by category", async () => {
    const res = await getIncidentsRoute(incidentsRequest("?category=flood"));
    const body = await res.json();
    expect(body.count).toBeGreaterThan(0);
    for (const incident of body.results as Incident[]) {
      expect(incident.category).toBe("flood");
    }
  });

  it("rejects an unknown category", async () => {
    const res = await getIncidentsRoute(incidentsRequest("?category=bogus"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unknown category "bogus"');
  });

  it("filters by severity and rejects unknown severity", async () => {
    const ok = await getIncidentsRoute(incidentsRequest("?severity=critical"));
    const body = await ok.json();
    for (const incident of body.results as Incident[]) {
      expect(incident.severity).toBe("critical");
    }
    const bad = await getIncidentsRoute(incidentsRequest("?severity=extreme"));
    expect(bad.status).toBe(400);
  });

  it("filters by verification and rejects unknown verification", async () => {
    const ok = await getIncidentsRoute(incidentsRequest("?verification=verified"));
    const body = await ok.json();
    for (const incident of body.results as Incident[]) {
      expect(incident.verificationStatus).toBe("verified");
    }
    const bad = await getIncidentsRoute(incidentsRequest("?verification=maybe"));
    expect(bad.status).toBe(400);
  });

  it("filters by county and rejects unknown county", async () => {
    const ok = await getIncidentsRoute(incidentsRequest("?county=Nairobi"));
    const body = await ok.json();
    for (const incident of body.results as Incident[]) {
      expect(incident.county).toBe("Nairobi");
    }
    const bad = await getIncidentsRoute(incidentsRequest("?county=Atlantis"));
    expect(bad.status).toBe(400);
  });

  it("filters by since and rejects an invalid date", async () => {
    const since = "2026-07-01T00:00:00Z";
    const ok = await getIncidentsRoute(incidentsRequest(`?since=${since}`));
    const body = await ok.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.count).toBeLessThan(getIncidentsSnapshot().length);
    for (const incident of body.results as Incident[]) {
      expect(new Date(incident.reportedAt).getTime()).toBeGreaterThanOrEqual(
        Date.parse(since)
      );
    }
    const bad = await getIncidentsRoute(incidentsRequest("?since=notadate"));
    expect(bad.status).toBe(400);
  });

  it("applies limit and rejects invalid limits", async () => {
    const res = await getIncidentsRoute(incidentsRequest("?limit=5"));
    const body = await res.json();
    expect(body.count).toBe(5);
    expect(body.results).toHaveLength(5);

    for (const bad of ["0", "-3", "abc"]) {
      const badRes = await getIncidentsRoute(incidentsRequest(`?limit=${bad}`));
      expect(badRes.status).toBe(400);
    }
  });

  it("combines category and limit", async () => {
    const res = await getIncidentsRoute(incidentsRequest("?category=flood&limit=2"));
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    for (const incident of body.results as Incident[]) {
      expect(incident.category).toBe("flood");
    }
  });
});

describe("GET /api/incidents/[id]", () => {
  it("returns a full incident including AI fields", async () => {
    const first = getIncidentsSnapshot()[0];
    const res = await getIncidentByIdRoute(
      incidentsRequest(`/${first.id}`),
      idParams(first.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(first.id);
    expect(typeof body.aiSummary).toBe("string");
    expect(Array.isArray(body.recommendedActions)).toBe(true);
  });

  it("404s for an unknown id", async () => {
    const res = await getIncidentByIdRoute(incidentsRequest("/nope"), idParams("nope"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/counties/[slug]", () => {
  it("returns the documented county summary shape", async () => {
    const res = await getCountyRoute(
      new NextRequest("http://localhost/api/counties/nairobi"),
      slugParams("nairobi")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["activeLast24h", "name", "riskScore", "slug", "topCategory"].sort()
    );
    expect(body.name).toBe("Nairobi");
    expect(body.slug).toBe("nairobi");
    expect(body.riskScore).toBeGreaterThanOrEqual(0);
    expect(body.riskScore).toBeLessThanOrEqual(100);
  });

  it("404s for an unknown slug", async () => {
    const res = await getCountyRoute(
      new NextRequest("http://localhost/api/counties/atlantis"),
      slugParams("atlantis")
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/reports", () => {
  function reportRequest(body: string): NextRequest {
    return new NextRequest("http://localhost/api/reports", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
  }

  const validBody = {
    category: "crime",
    description: "Suspicious activity near the market",
    lat: -1.2921,
    lng: 36.8219,
    anonymous: true,
  };

  it("accepts a valid report", async () => {
    const res = await postReportRoute(reportRequest(JSON.stringify(validBody)));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^rpt_[0-9a-f]{4}$/);
    expect(body.status).toBe("pending_review");
  });

  it("rejects invalid submissions", async () => {
    const cases = [
      { ...validBody, category: "gossip" },
      { ...validBody, description: "   " },
      { ...validBody, lat: 51.5 },
      { ...validBody, lng: 0 },
      { ...validBody, anonymous: "yes" },
      { category: "crime" },
    ];
    for (const c of cases) {
      const res = await postReportRoute(reportRequest(JSON.stringify(c)));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(typeof body.error).toBe("string");
    }
  });

  it("rejects malformed JSON", async () => {
    const res = await postReportRoute(reportRequest("{oops"));
    expect(res.status).toBe(400);
  });
});
