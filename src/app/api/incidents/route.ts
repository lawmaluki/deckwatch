import type { NextRequest } from "next/server";
import { getIncidents } from "@/lib/incidents-source";
import { filterIncidents } from "@/lib/incident-filter";
import { parseIncidentQuery } from "@/lib/api-validation";

// NOTE: results are full Incident objects — a deliberate superset of the
// example in /api-docs (aiSummary/recommendedActions included) so clients can
// render incident detail without a per-incident follow-up fetch.
export async function GET(request: NextRequest) {
  const parsed = parseIncidentQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const incidents = await getIncidents();
  let results = filterIncidents(incidents, parsed.value.filter);
  if (parsed.value.limit !== null) {
    results = results.slice(0, parsed.value.limit);
  }

  return Response.json({ count: results.length, results });
}
