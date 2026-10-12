export type Category =
  | "crime"
  | "traffic_accident"
  | "flood"
  | "fire"
  | "unrest"
  | "missing_person"
  | "terror_alert"
  | "public_health"
  | "infrastructure"
  | "wildlife"
  | "election_violence";

export type Severity = "low" | "medium" | "high" | "critical";

export type VerificationStatus =
  | "verified"
  | "likely_true"
  | "unconfirmed"
  | "false_report";

/** Mirrors backend domain.LOCATION_PRECISIONS, most precise first. */
export type LocationPrecision = "local" | "town" | "road" | "area" | "county";

export type SourceType ="news" | "police" | "citizen" | "government" | "social";

export interface Source {
  name: string;
  type: SourceType;
  /** Outlet or agency homepage; absent for anonymous citizen reports. */
  url?: string;
}

export interface Incident {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  county: string;
  locationName: string;
  /** How much ground lat/lng stands for: a village or estate ("local"), a
   * town, somewhere along a named road, a wider area, or only the county
   * centre. Null for seed data and incidents not yet re-located; absent from
   * the seed-only API. See backend/app/ingest/geocode.py. */
  locationPrecision?: LocationPrecision | null;
  lat: number;
  lng: number;
  reportedAt: string;
  verificationScore: number;
  verificationStatus: VerificationStatus;
  sources: Source[];
  reportCount: number;
  /** Detail-only. Absent from list responses, which omit both to stay small;
   * /api/incidents/{id} carries them. See IncidentDetailPanel. */
  aiSummary?: string;
  recommendedActions?: string[];
  hasImage: boolean;
  isCitizenReport: boolean;
  /** True for incidents written by the real news-ingestion pipeline, as
   * opposed to the seeded sample dataset. */
  isLive: boolean;
}

export interface CountyInfo {
  name: string;
  slug: string;
  code: number;
  center: [number, number];
}
