import type { NextRequest } from "next/server";
import { validateReportBody } from "@/lib/api-validation";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const validated = validateReportBody(body);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  // Stateless echo — submissions are not persisted until the real backend
  // with a moderation queue lands.
  const id = `rpt_${Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0")}`;

  return Response.json({ id, status: "pending_review" }, { status: 201 });
}
