import { CONTACT_EMAIL } from "@/lib/constants";
import { SITE_URL } from "@/lib/api-spec";

/** Shown as "Last updated" on both policy pages. Bump it with any change to
 * what they say. */
export const POLICIES_UPDATED = "5 November 2026";

/** The response time the Terms promise for corrections and takedowns. */
export const CORRECTION_RESPONSE_HOURS = 72;

/** A mailto link that arrives with the incident already identified, so a
 * report needs no back-and-forth to find what it is about. Incidents have no
 * page of their own, so it points at the incident's public API record. */
export function reportProblemHref(incident: { id: string; title: string }): string {
  const subject = `Problem with incident ${incident.id}`;
  const body = [
    `Incident: ${incident.title}`,
    `Record: ${SITE_URL}/api/incidents/${encodeURIComponent(incident.id)}`,
    "",
    "What is wrong (wrong facts or location, not a real incident, a duplicate, or it exposes someone):",
    "",
  ].join("\n");
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
