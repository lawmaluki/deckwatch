import type { NextRequest } from "next/server";
import { getLiveIncidents } from "@/lib/incidents-source";
import { COUNTY_BY_SLUG } from "@/lib/data/counties";
import { countyRiskScore, categoryBreakdown, withinHours } from "@/lib/stats";
import { BACKEND_URL, proxyJson } from "@/lib/backend";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (BACKEND_URL) return proxyJson(`/counties/${encodeURIComponent(slug)}`);

  const county = COUNTY_BY_SLUG[slug];
  if (!county) {
    return Response.json({ error: "County not found" }, { status: 404 });
  }

  const nowMs = Date.now();
  const incidents = getLiveIncidents(nowMs).filter((i) => i.county === county.name);

  return Response.json({
    name: county.name,
    slug: county.slug,
    riskScore: countyRiskScore(incidents, nowMs),
    activeLast24h: incidents.filter((i) => withinHours(i, 24, nowMs)).length,
    topCategory: categoryBreakdown(incidents)[0]?.category ?? null,
  });
}
