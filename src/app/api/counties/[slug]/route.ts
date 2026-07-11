import type { NextRequest } from "next/server";
import { getIncidents } from "@/lib/incidents-source";
import { COUNTY_BY_SLUG } from "@/lib/data/counties";
import { countyRiskScore, categoryBreakdown, withinHours } from "@/lib/stats";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const county = COUNTY_BY_SLUG[slug];
  if (!county) {
    return Response.json({ error: "County not found" }, { status: 404 });
  }

  const incidents = (await getIncidents()).filter((i) => i.county === county.name);

  return Response.json({
    name: county.name,
    slug: county.slug,
    riskScore: countyRiskScore(incidents),
    activeLast24h: incidents.filter((i) => withinHours(i, 24)).length,
    topCategory: categoryBreakdown(incidents)[0]?.category ?? null,
  });
}
