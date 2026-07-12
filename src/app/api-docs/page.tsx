import type { Metadata } from "next";
import { AlertTriangle, KeyRound } from "lucide-react";

export const metadata: Metadata = {
  title: "API — Deckwatch Kenya",
  description: "Public API for Deckwatch Kenya incident data.",
};

interface EndpointDoc {
  method: "GET" | "POST";
  path: string;
  summary: string;
  example: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    method: "GET",
    path: "/api/incidents",
    summary:
      "List incidents. Supports query params: category, severity, county, verification, since (ISO date), limit.",
    example: `{
  "count": 2,
  "asOf": "2026-07-12T10:30:00.000Z",
  "results": [
    {
      "id": "ow-0001",
      "title": "Flash flooding reported Tana River County",
      "category": "flood",
      "severity": "high",
      "county": "Tana River",
      "locationName": "Tana River Delta, near the river bridge",
      "lat": -2.0143,
      "lng": 40.1152,
      "reportedAt": "2026-07-02T06:10:00Z",
      "verificationScore": 78,
      "verificationStatus": "likely_true",
      "sources": [
        { "name": "Kenya Red Cross", "type": "government", "url": "https://www.redcross.or.ke" },
        { "name": "Citizen report", "type": "citizen" }
      ],
      "reportCount": 6,
      "hasImage": false
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/incidents/{id}",
    summary: "Fetch a single incident, including AI summary and recommended actions.",
    example: `{
  "id": "ow-0001",
  "title": "Flash flooding reported Tana River County",
  "aiSummary": "Classified as a high severity flood incident in Tana River County...",
  "recommendedActions": [
    "Avoid crossing flooded roads or bridges",
    "Move to higher ground if in a low-lying area"
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/counties/{slug}",
    summary: "County summary: active incidents, risk score, category breakdown, trend.",
    example: `{
  "name": "Nairobi",
  "slug": "nairobi",
  "riskScore": 82,
  "activeLast24h": 6,
  "topCategory": "crime"
}`,
  },
  {
    method: "POST",
    path: "/api/reports",
    summary:
      "Submit a citizen report for moderation (photo/video, description, location, optional anonymity).",
    example: `// Request
{
  "category": "crime",
  "description": "...",
  "lat": -1.2921,
  "lng": 36.8219,
  "anonymous": true
}

// Response
{
  "id": "rpt_8f2a",
  "status": "pending_review"
}`,
  },
];

export default function ApiDocsPage() {
  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
          Developer reference
        </p>
        <h1 className="mb-4 text-2xl font-semibold text-foreground sm:text-3xl">
          Deckwatch Kenya API
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-muted sm:text-base">
          The shapes below mirror the incident and county data model already
          powering this site. They describe the public API for pulling
          Deckwatch data into your own tools.
        </p>

        <div className="mb-8 flex gap-3 rounded-2xl border border-medium/30 bg-medium/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-medium" />
          <p className="text-sm leading-relaxed text-foreground/90">
            <span className="font-semibold">Live in this deployment — sample data.</span>{" "}
            These endpoints are served by this site and can be called as
            documented. They currently return the same seeded sample dataset
            that powers the map; real ingestion arrives with the FastAPI +
            PostgreSQL/PostGIS backend described on the{" "}
            <a href="/why" className="text-brand hover:underline">
              Why Deckwatch
            </a>{" "}
            page.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-brand" />
            Authentication (planned)
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Read endpoints are planned to be open and unauthenticated, rate-limited
            per IP. Write endpoints (citizen reports) will require a lightweight
            device or session token to limit abuse — exact scheme is still to be
            decided.
          </p>
        </div>

        <div className="space-y-5">
          {ENDPOINTS.map((ep) => (
            <div key={ep.path} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
                    ep.method === "GET"
                      ? "bg-brand/15 text-brand"
                      : "bg-high/15 text-high"
                  }`}
                >
                  {ep.method}
                </span>
                <code className="font-mono text-sm text-foreground">{ep.path}</code>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-muted">{ep.summary}</p>
              <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                {ep.example}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
