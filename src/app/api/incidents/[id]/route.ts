import type { NextRequest } from "next/server";
import { getIncidents } from "@/lib/incidents-source";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incidents = await getIncidents();
  const incident = incidents.find((i) => i.id === id);
  if (!incident) {
    return Response.json({ error: "Incident not found" }, { status: 404 });
  }
  return Response.json(incident);
}
