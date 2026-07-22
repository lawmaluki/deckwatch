import type { Incident } from "@/lib/types";
import { DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { MS_PER_HOUR } from "@/lib/constants";

let counter = 0;

/** Build a valid Incident with overridable fields for tests. */
export function makeIncident(overrides: Partial<Incident> = {}): Incident {
  counter += 1;
  return {
    id: `test-${counter}`,
    title: "Test incident near the market",
    category: "crime",
    severity: "medium",
    county: "Nairobi",
    locationName: "Test Location",
    lat: -1.2905,
    lng: 36.8771,
    reportedAt: DATA_REFERENCE_TIME.toISOString(),
    verificationScore: 60,
    verificationStatus: "likely_true",
    sources: [{ name: "Citizen report", type: "citizen" }],
    reportCount: 2,
    aiSummary: "Test summary.",
    recommendedActions: ["Stay clear"],
    hasImage: false,
    isCitizenReport: true,
    isLive: false,
    ...overrides,
  };
}

/** ISO timestamp N hours before the dataset's fixed reference time. */
export function hoursBeforeReference(hours: number): string {
  return new Date(DATA_REFERENCE_TIME.getTime() - hours * MS_PER_HOUR).toISOString();
}
