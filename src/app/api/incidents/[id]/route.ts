import type { NextRequest } from "next/server";
import { getLiveIncidents } from "@/lib/incidents-source";
import { BACKEND_URL, proxyJson } from "@/lib/backend";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (BACKEND_URL) return proxyJson(`/incidents/${encodeURIComponent(id)}`);

  const incident = getLiveIncidents(Date.now()).find((i) => i.id === id);
  if (!incident) {
    return Response.json({ error: "Incident not found" }, { status: 404 });
  }
  return Response.json(incident);
}
