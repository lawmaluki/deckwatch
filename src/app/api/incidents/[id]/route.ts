import type { NextRequest } from "next/server";
import { getLiveIncidents } from "@/lib/incidents-source";
import { BACKEND_URL, proxyJson } from "@/lib/backend";
import { API_CACHE_SECONDS, apiJson } from "@/lib/api-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (BACKEND_URL) {
    return proxyJson(`/incidents/${encodeURIComponent(id)}`, undefined, { cacheSeconds: API_CACHE_SECONDS.live });
  }

  const incident = getLiveIncidents(Date.now()).find((i) => i.id === id);
  if (!incident) {
    return apiJson({ error: "Incident not found" }, { status: 404 });
  }
  return apiJson(incident, { cacheSeconds: API_CACHE_SECONDS.live });
}
