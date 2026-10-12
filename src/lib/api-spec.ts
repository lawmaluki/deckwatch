import { CATEGORIES, SEVERITY_CONFIG, VERIFICATION_CONFIG } from "@/lib/data/categories";
import { API_CACHE_SECONDS } from "@/lib/api-response";

// The public API, described once. The /api-docs page and /api/openapi.json
// are both generated from this list, so the reference and the machine-readable
// spec can't disagree. Add an endpoint here when you add a route.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://deckwatch.vercel.app";

export interface ApiParam {
  name: string;
  in: "query" | "path";
  type: "string" | "integer";
  description: string;
  required?: boolean;
  enum?: readonly (string | number)[];
  example?: string;
}

export interface ApiEndpoint {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  summary: string;
  params: ApiParam[];
  /** Seconds the edge may cache a successful response. */
  cacheSeconds?: number;
  /** A concrete request the "Try it" button sends. "latest-incident" fills
   * {id} with the newest incident's id at click time. */
  tryIt?: { path: string } | { path: string; fill: "latest-incident" };
  example: string;
}

const categories = Object.keys(CATEGORIES);
const severities = Object.keys(SEVERITY_CONFIG);
const verifications = Object.keys(VERIFICATION_CONFIG);

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: "list-incidents",
    method: "GET",
    path: "/api/incidents",
    title: "List incidents",
    summary:
      "Real incidents ingested from Kenyan newsrooms, newest first. Filters combine. Results are summaries: aiSummary and recommendedActions come from the single-incident endpoint. locationPrecision says how much ground lat/lng stands for: local (a village or estate), town, road (somewhere along it), area, or county (only the county centre is known; don't read the point as a place).",
    params: [
      { name: "category", in: "query", type: "string", enum: categories, description: "Only this kind of incident.", example: "traffic_accident" },
      { name: "severity", in: "query", type: "string", enum: severities, description: "Only this severity.", example: "critical" },
      { name: "county", in: "query", type: "string", description: "County name, as written on the site.", example: "Nakuru" },
      { name: "verification", in: "query", type: "string", enum: verifications, description: "Only this verification status." },
      { name: "since", in: "query", type: "string", description: "ISO 8601 date or time; only incidents reported at or after it.", example: "2026-10-01" },
      { name: "limit", in: "query", type: "integer", description: "At most this many, taken from the newest.", example: "20" },
    ],
    cacheSeconds: API_CACHE_SECONDS.live,
    tryIt: { path: "/api/incidents?limit=3" },
    example: `{
  "count": 1,
  "asOf": "2026-10-08T17:30:00.000Z",
  "results": [
    {
      "id": "ing-cd5b3213",
      "title": "17 killed in Salama road accident while travelling for National Prayer Day",
      "category": "traffic_accident",
      "severity": "critical",
      "county": "Makueni",
      "locationName": "Salama",
      "locationPrecision": "town",
      "lat": -1.7442,
      "lng": 37.6012,
      "reportedAt": "2026-10-03T06:12:00.000Z",
      "verificationScore": 82,
      "verificationStatus": "verified",
      "sources": [
        { "name": "Citizen Digital", "type": "news", "url": "https://www.citizen.digital/..." },
        { "name": "Nation Africa", "type": "news", "url": "https://nation.africa/..." }
      ],
      "reportCount": 2,
      "hasImage": false,
      "isCitizenReport": false,
      "isLive": true
    }
  ]
}`,
  },
  {
    id: "get-incident",
    method: "GET",
    path: "/api/incidents/{id}",
    title: "Get one incident",
    summary: "A single incident with its AI summary and recommended safety actions. 404 if the id is unknown.",
    params: [{ name: "id", in: "path", type: "string", required: true, description: "Incident id from the list, e.g. ing-cd5b3213." }],
    cacheSeconds: API_CACHE_SECONDS.live,
    tryIt: { path: "/api/incidents/{id}", fill: "latest-incident" },
    example: `{
  "id": "ing-cd5b3213",
  "title": "17 killed in Salama road accident while travelling for National Prayer Day",
  "category": "traffic_accident",
  "severity": "critical",
  "county": "Makueni",
  "aiSummary": "A bus carrying pilgrims to Subukia collided with a lorry at Salama...",
  "recommendedActions": [
    "Avoid the affected stretch of road",
    "Watch for emergency responders"
  ],
  "...": "every field of the list item"
}`,
  },
  {
    id: "get-county",
    method: "GET",
    path: "/api/counties/{slug}",
    title: "County at a glance",
    summary: "Risk score, incidents in the last 24 hours and the top category (null when none). 404 for an unknown county.",
    params: [{ name: "slug", in: "path", type: "string", required: true, description: "Lower-case county name with hyphens, e.g. nairobi, homa-bay, elgeyo-marakwet." }],
    cacheSeconds: API_CACHE_SECONDS.live,
    tryIt: { path: "/api/counties/nairobi" },
    example: `{
  "name": "Nairobi",
  "slug": "nairobi",
  "riskScore": 82,
  "activeLast24h": 6,
  "topCategory": "crime"
}`,
  },
  {
    id: "get-county-summary",
    method: "GET",
    path: "/api/counties/{slug}/summary",
    title: "County trend",
    summary:
      "Incident counts for a recent period compared with the period before it, broken down by category and severity, with a daily trend.",
    params: [
      { name: "slug", in: "path", type: "string", required: true, description: "County slug, as above." },
      { name: "days", in: "query", type: "integer", enum: [7, 30, 90], description: "Length of the period. Default 30." },
    ],
    cacheSeconds: API_CACHE_SECONDS.live,
    tryIt: { path: "/api/counties/nairobi/summary?days=7" },
    example: `{
  "county": "Nairobi",
  "slug": "nairobi",
  "asOf": "2026-10-08T17:32:43.912Z",
  "periodDays": 7,
  "unit": "incidents",
  "total": 41,
  "previousTotal": 37,
  "changePercent": 11,
  "categories": [
    { "category": "crime", "count": 14, "previousCount": 12, "changePercent": 17 }
  ],
  "...": "severities and a daily trend follow"
}`,
  },
  {
    id: "list-monthly-reports",
    method: "GET",
    path: "/api/monthly-reports",
    title: "List monthly reports",
    summary:
      "Every published monthly safety report, newest first, as a summary. A report is published on the last day of each month.",
    params: [],
    cacheSeconds: API_CACHE_SECONDS.reportList,
    tryIt: { path: "/api/monthly-reports" },
    example: `{
  "count": 1,
  "results": [
    {
      "month": "2026-09",
      "generatedAt": "2026-10-01T00:00:00Z",
      "method": "editorial",
      "incidents": 105,
      "counties": 37,
      "deaths": 93,
      "articles": 369,
      "headline": "A violent fortnight in the north, and deadly roads everywhere else"
    }
  ]
}`,
  },
  {
    id: "get-monthly-report",
    method: "GET",
    path: "/api/monthly-reports/{month}",
    title: "Get a monthly report",
    summary:
      "One month's full report: every consolidated incident with its sources, hotspots, the watch list and how the month's coverage was counted. The same data as /dashboard/reports/{month}.",
    params: [{ name: "month", in: "path", type: "string", required: true, description: "YYYY-MM, e.g. 2026-09." }],
    cacheSeconds: API_CACHE_SECONDS.report,
    tryIt: { path: "/api/monthly-reports/2026-09" },
    example: `{
  "version": 1,
  "month": "2026-09",
  "method": "editorial",
  "coverageFrom": "2026-09-12",
  "articles": 369,
  "eventArticles": 212,
  "events": [
    {
      "key": "kajiado-air",
      "title": "Training aircraft crashes near Kipeto wind farm, killing instructor and student pilot",
      "date": "2026-09-18",
      "county": "Kajiado",
      "category": "road",
      "deaths": 2,
      "articles": 23,
      "outlets": ["Tuko News", "Citizen Digital", "..."],
      "sources": [{ "name": "Tuko News", "url": "https://www.tuko.co.ke/...", "title": "..." }]
    }
  ],
  "hotspots": [ ... ],
  "watch": [ ... ]
}`,
  },
  {
    id: "submit-report",
    method: "POST",
    path: "/api/reports",
    title: "Submit a citizen report",
    summary:
      "Validates a report and returns an id with status pending_review. Nothing is stored yet, so this is for testing an integration; it is only accepted from deckwatch itself, not from other sites.",
    params: [],
    example: `// Request body
{
  "category": "crime",
  "description": "Armed robbery outside the bank",
  "lat": -1.2921,
  "lng": 36.8219,
  "anonymous": true
}

// 201 response
{ "id": "rpt_8f2a", "status": "pending_review" }`,
  },
];

/** OpenAPI 3.1 description of the public API, for Postman, Swagger UI and
 * client generators. */
export function openApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of API_ENDPOINTS) {
    const operation: Record<string, unknown> = {
      operationId: ep.id,
      summary: ep.title,
      description: ep.summary,
      parameters: ep.params.map((p) => ({
        name: p.name,
        in: p.in,
        required: p.in === "path" || !!p.required,
        description: p.description,
        schema: { type: p.type, ...(p.enum ? { enum: p.enum } : {}) },
        ...(p.example ? { example: p.example } : {}),
      })),
      responses: {
        [ep.method === "POST" ? "201" : "200"]: { description: "Success", content: { "application/json": {} } },
        "400": { description: "Invalid parameter or body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        ...(ep.params.some((p) => p.in === "path")
          ? { "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } }
          : {}),
      },
    };
    if (ep.method === "POST") {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["category", "description", "lat", "lng"],
              properties: {
                category: { type: "string", enum: categories },
                description: { type: "string" },
                lat: { type: "number" },
                lng: { type: "number" },
                anonymous: { type: "boolean" },
              },
            },
          },
        },
      };
    }
    paths[ep.path] = { ...(paths[ep.path] ?? {}), [ep.method.toLowerCase()]: operation };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Deckwatch Kenya API",
      version: "1.0.0",
      description:
        "Public safety incidents in Kenya, consolidated from Kenyan newsrooms. Read endpoints are free, need no key and may be called from any website.",
    },
    servers: [{ url: SITE_URL }],
    paths,
    components: {
      schemas: {
        Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
      },
    },
  };
}
