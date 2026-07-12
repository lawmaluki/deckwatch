import type { NextRequest } from "next/server";
import { getLiveIncidents } from "@/lib/incidents-source";
import { filterIncidents } from "@/lib/incident-filter";
import { parseIncidentQuery } from "@/lib/api-validation";

// NOTE: results are full Incident objects — a deliberate superset of the
// example in /api-docs (aiSummary/recommendedActions included) so clients can
// render incident detail without a per-incident follow-up fetch. Data is
// re-anchored to request time (asOf) so the feed always reads as live.
export async function GET(request: NextRequest) {
  const asOf = new Date();
  const parsed = parseIncidentQuery(request.nextUrl.searchParams, asOf.getTime());
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  let results = filterIncidents(
    getLiveIncidents(asOf.getTime()),
    parsed.value.filter,
    asOf.getTime()
  );
  if (parsed.value.limit !== null) {
    results = results.slice(0, parsed.value.limit);
  }

  return Response.json({
    count: results.length,
    asOf: asOf.toISOString(),
    results,
  });
}
