import type { NextRequest } from "next/server";
import { getLiveIncidents } from "@/lib/incidents-source";
import { filterIncidents } from "@/lib/incident-filter";
import { parseIncidentQuery } from "@/lib/api-validation";
import { BACKEND_URL, proxyJson } from "@/lib/backend";

// NOTE: results are summaries. aiSummary and recommendedActions were once
// included so a client could render detail without a follow-up fetch, but
// they are ~35% of the payload and are read for the one incident a reader
// opens, so that trade stopped paying at this list size — /incidents/{id}
// serves them instead. Data is re-anchored to request time (asOf) so the
// feed always reads as live.
export async function GET(request: NextRequest) {
  if (BACKEND_URL) {
    // Seed rows live in the deployed database but can never be displayed, so
    // the filter is forced here rather than left to the client: unfiltered,
    // better than half of every poll was seed the browser downloaded only to
    // discard. Gated on BACKEND_URL for the same reason getIncidents() is —
    // api mode without a backend serves the seed from here, and there it is
    // the only data there is.
    const params = new URLSearchParams(request.nextUrl.searchParams);
    params.set("live", "true");
    return proxyJson(`/incidents?${params}`);
  }

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
