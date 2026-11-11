import { SITE_URL } from "@/lib/api-spec";
import type { Incident } from "@/lib/types";

/** The incident's own page: the live map, opened on that incident. */
export function incidentPath(id: string): string {
  return `/incident/${encodeURIComponent(id)}`;
}

/** Absolute, because a shared link leaves the site — a relative one is
 * meaningless in a WhatsApp message. `origin` is the browser's own when known,
 * so a link shared from a preview deploy points back at that deploy. */
export function incidentShareUrl(id: string, origin: string = SITE_URL): string {
  return `${origin.replace(/\/+$/, "")}${incidentPath(id)}`;
}

/** One line that still makes sense pasted somewhere with no link preview. */
export function incidentShareText(
  incident: Pick<Incident, "title" | "locationName" | "county">
): string {
  return `${incident.title} — ${incident.locationName}, ${incident.county} County`;
}
