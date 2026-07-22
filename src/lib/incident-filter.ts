import type {
  Category,
  Incident,
  Severity,
  VerificationStatus,
} from "@/lib/types";
import { hoursAgo } from "@/lib/stats";

/**
 * Declarative filter criteria. Every field is optional; omitted or empty
 * criteria match all incidents. Kept framework-free so it can be unit
 * tested and reused server-side (e.g. a future API route) unchanged.
 */
export interface IncidentFilter {
  /** Match any of these categories (empty = all). */
  categories?: Category[];
  /** Match any of these severities (empty = all). */
  severities?: Severity[];
  /** Match any of these verification statuses (empty = all). */
  verification?: VerificationStatus[];
  /** Exact county name. */
  county?: string | null;
  /** Only incidents reported within the last N hours. */
  withinHours?: number | null;
  /** Case-insensitive substring match on title, location, and county. */
  freeText?: string;
  /** Only incidents whose reportedAt falls inside [start, end] (epoch ms). */
  timeWindow?: { start: number; end: number } | null;
  /** Only incidents from the real ingestion pipeline (excludes seed data). */
  liveOnly?: boolean;
}

export function filterIncidents(
  incidents: Incident[],
  filter: IncidentFilter,
  nowMs?: number
): Incident[] {
  const freeText = filter.freeText?.trim().toLowerCase() ?? "";

  return incidents.filter((incident) => {
    if (filter.categories?.length && !filter.categories.includes(incident.category)) {
      return false;
    }
    if (filter.severities?.length && !filter.severities.includes(incident.severity)) {
      return false;
    }
    if (
      filter.verification?.length &&
      !filter.verification.includes(incident.verificationStatus)
    ) {
      return false;
    }
    if (filter.liveOnly && !incident.isLive) return false;
    if (filter.county && incident.county !== filter.county) return false;
    if (filter.withinHours && hoursAgo(incident, nowMs) > filter.withinHours) return false;
    if (freeText) {
      const haystack =
        `${incident.title} ${incident.locationName} ${incident.county}`.toLowerCase();
      if (!haystack.includes(freeText)) return false;
    }
    if (filter.timeWindow) {
      const t = new Date(incident.reportedAt).getTime();
      if (t < filter.timeWindow.start || t > filter.timeWindow.end) return false;
    }
    return true;
  });
}
