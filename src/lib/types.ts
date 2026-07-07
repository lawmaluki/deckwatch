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

export type SourceType = "news" | "police" | "citizen" | "government" | "social";

export interface Source {
  name: string;
  type: SourceType;
}

export interface Incident {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  county: string;
  locationName: string;
  lat: number;
  lng: number;
  reportedAt: string;
  verificationScore: number;
  verificationStatus: VerificationStatus;
  sources: Source[];
  reportCount: number;
  aiSummary: string;
  recommendedActions: string[];
  hasImage: boolean;
  isCitizenReport: boolean;
}

export interface CountyInfo {
  name: string;
  slug: string;
  code: number;
  center: [number, number];
}

export interface DateRangePreset {
  label: string;
  hours: number;
}
