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
      "List incidents, newest first. Supports query params: category, severity, county, verification, live (true/false — real ingested incidents vs seed data), since (ISO date), limit (positive integer; applied after sorting, so limit=N returns the N most recent). Results are full incident objects — the example below is trimmed, and each result also carries aiSummary and recommendedActions. Live incidents (isLive: true, ids starting ing-) keep their source article's real publish time in reportedAt; seed incidents have theirs shifted to read as recent.",
    example: `{
  "count": 2,
  "asOf": "2026-07-12T10:30:00.000Z",
  "results": [
    {
      "id": "ing-4f9a2c31",
      "title": "Six dead, five injured in Nakuru-Eldoret Highway crash",
      "category": "traffic_accident",
      "severity": "critical",
      "county": "Nakuru",
      "locationName": "Nakuru-Eldoret Highway",
      "lat": -0.3031,
      "lng": 36.0800,
      "reportedAt": "2026-07-02T06:10:00Z",
      "verificationScore": 46,
      "verificationStatus": "unconfirmed",
      "sources": [
        { "name": "The Standard", "type": "news", "url": "https://www.standardmedia.co.ke" }
      ],
      "reportCount": 1,
      "hasImage": false,
      "isLive": true
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/incidents/{id}",
    summary:
      "Fetch a single incident, including AI summary and recommended actions. Returns 404 if the id is unknown.",
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
    summary:
      "County summary: risk score, incidents in the last 24 hours, and the top incident category (null if the county has no incidents). Returns 404 if the slug is unknown.",
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
      "Submit a citizen report: category, description, location (lat/lng within Kenya), optional anonymity. Validated and acknowledged with 201, but not stored — there is no moderation queue behind it yet.",
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
            <span className="font-semibold">Live in this deployment — real data.</span>{" "}
            These endpoints are served by this site and proxy to the FastAPI +
            PostgreSQL/PostGIS backend described on the{" "}
            <a href="/why" className="text-brand hover:underline">
              Why Deckwatch
            </a>{" "}
            page. The incident endpoints return real reporting ingested from 13
            Kenyan newsrooms, alongside the seeded sample set that keeps the map
            populated while coverage grows — pass{" "}
            <code className="rounded bg-surface px-1 py-0.5 text-[13px] text-foreground">
              live=true
            </code>{" "}
            for only the real ones. <code className="text-foreground">/api/reports</code>{" "}
            is the exception: it validates a submission and hands back an id,
            but stores nothing until there is a moderation queue behind it.
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

        <div className="mt-8 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Errors</h2>
          <p className="mb-3 text-sm leading-relaxed text-muted">
            Errors return a JSON body with a single{" "}
            <code className="text-foreground">error</code> message. Invalid query
            parameters or a malformed report body return 400; an unknown incident
            or county returns 404.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
            {`// 400
{ "error": "Invalid limit \\"0\\". Expected a positive integer." }

// 404
{ "error": "Incident not found" }`}
          </pre>
        </div>
      </div>
    </div>
  );
}
