import type { NextRequest } from "next/server";
import { getLiveIncidents } from "@/lib/incidents-source";
import { COUNTY_BY_SLUG } from "@/lib/data/counties";
import { countyIncidentSummary } from "@/lib/incident-summary";
import { BACKEND_URL, proxyJson } from "@/lib/backend";

const ALLOWED_DAYS = new Set([7, 30, 90]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const rawDays = request.nextUrl.searchParams.get("days") ?? "30";
  const days = Number(rawDays);
  if (!Number.isInteger(days) || !ALLOWED_DAYS.has(days)) {
    return Response.json(
      { error: "Invalid days. Expected one of: 7, 30, 90." },
      { status: 400 }
    );
  }

  if (BACKEND_URL) {
    return proxyJson(
      `/counties/${encodeURIComponent(slug)}/summary?days=${days}`
    );
  }

  const county = COUNTY_BY_SLUG[slug];
  if (!county) {
    return Response.json({ error: "County not found" }, { status: 404 });
  }

  const asOf = new Date();
  const incidents = getLiveIncidents(asOf.getTime()).filter(
    (incident) => incident.county === county.name
  );
  return Response.json({
    county: county.name,
    slug: county.slug,
    asOf: asOf.toISOString(),
    ...countyIncidentSummary(incidents, asOf.getTime(), days),
  });
}
