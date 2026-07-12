import type { Category, Severity, VerificationStatus } from "@/lib/types";
import type { IncidentFilter } from "@/lib/incident-filter";
import { CATEGORIES, SEVERITY_CONFIG, VERIFICATION_CONFIG } from "@/lib/data/categories";
import { COUNTY_BY_NAME } from "@/lib/data/counties";
import { getReferenceTime } from "@/lib/incidents-source";

/**
 * Framework-free request validation for the public API. Kept out of the
 * route handlers so it can be unit tested directly and serve as the
 * reference for the future backend's validation layer.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const CATEGORY_SET = new Set(Object.keys(CATEGORIES));
const SEVERITY_SET = new Set(Object.keys(SEVERITY_CONFIG));
const VERIFICATION_SET = new Set(Object.keys(VERIFICATION_CONFIG));

// Rough bounding box for Kenya, with margin for border areas.
const KENYA_LAT_MIN = -5;
const KENYA_LAT_MAX = 5.5;
const KENYA_LNG_MIN = 33;
const KENYA_LNG_MAX = 42.5;

function unknownValueError(param: string, value: string, allowed: Set<string>): string {
  return `Unknown ${param} "${value}". Expected one of: ${[...allowed].join(", ")}.`;
}

export interface IncidentQuery {
  filter: IncidentFilter;
  limit: number | null;
}

export function parseIncidentQuery(
  params: URLSearchParams,
  nowMs: number = getReferenceTime().getTime()
): ValidationResult<IncidentQuery> {
  const filter: IncidentFilter = {};

  const category = params.get("category");
  if (category !== null) {
    if (!CATEGORY_SET.has(category)) {
      return { ok: false, error: unknownValueError("category", category, CATEGORY_SET) };
    }
    filter.categories = [category as Category];
  }

  const severity = params.get("severity");
  if (severity !== null) {
    if (!SEVERITY_SET.has(severity)) {
      return { ok: false, error: unknownValueError("severity", severity, SEVERITY_SET) };
    }
    filter.severities = [severity as Severity];
  }

  const verification = params.get("verification");
  if (verification !== null) {
    if (!VERIFICATION_SET.has(verification)) {
      return {
        ok: false,
        error: unknownValueError("verification", verification, VERIFICATION_SET),
      };
    }
    filter.verification = [verification as VerificationStatus];
  }

  const county = params.get("county");
  if (county !== null) {
    if (!COUNTY_BY_NAME[county]) {
      return { ok: false, error: `Unknown county "${county}".` };
    }
    filter.county = county;
  }

  const since = params.get("since");
  if (since !== null) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: `Invalid since date "${since}". Expected an ISO date.` };
    }
    filter.timeWindow = { start: parsed.getTime(), end: nowMs };
  }

  let limit: number | null = null;
  const rawLimit = params.get("limit");
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
      return { ok: false, error: `Invalid limit "${rawLimit}". Expected a positive integer.` };
    }
    limit = Number(rawLimit);
  }

  return { ok: true, value: { filter, limit } };
}

export interface ReportSubmission {
  category: Category;
  description: string;
  lat: number;
  lng: number;
  anonymous: boolean;
}

export function validateReportBody(body: unknown): ValidationResult<ReportSubmission> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.category !== "string" || !CATEGORY_SET.has(b.category)) {
    return {
      ok: false,
      error: unknownValueError("category", String(b.category), CATEGORY_SET),
    };
  }
  if (typeof b.description !== "string" || b.description.trim() === "") {
    return { ok: false, error: "description must be a non-empty string." };
  }
  if (
    typeof b.lat !== "number" ||
    !Number.isFinite(b.lat) ||
    b.lat < KENYA_LAT_MIN ||
    b.lat > KENYA_LAT_MAX
  ) {
    return { ok: false, error: `lat must be a number between ${KENYA_LAT_MIN} and ${KENYA_LAT_MAX}.` };
  }
  if (
    typeof b.lng !== "number" ||
    !Number.isFinite(b.lng) ||
    b.lng < KENYA_LNG_MIN ||
    b.lng > KENYA_LNG_MAX
  ) {
    return { ok: false, error: `lng must be a number between ${KENYA_LNG_MIN} and ${KENYA_LNG_MAX}.` };
  }
  if (b.anonymous !== undefined && typeof b.anonymous !== "boolean") {
    return { ok: false, error: "anonymous must be a boolean." };
  }

  return {
    ok: true,
    value: {
      category: b.category as Category,
      description: b.description.trim(),
      lat: b.lat,
      lng: b.lng,
      anonymous: b.anonymous === true,
    },
  };
}
