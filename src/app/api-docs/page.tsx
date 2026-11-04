import type { Metadata } from "next";
import { FileJson, Globe, KeyRound, Timer, Zap } from "lucide-react";
import { API_ENDPOINTS, SITE_URL, type ApiEndpoint } from "@/lib/api-spec";
import { CodeTabs } from "@/components/api/CodeTabs";
import { CopyButton } from "@/components/api/CopyButton";
import { TryIt } from "@/components/api/TryIt";
import { CONTACT_EMAIL, NEWS_SOURCE_COUNT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "API",
  description:
    "Free public API for Deckwatch Kenya: real safety incidents from Kenyan newsrooms, county figures and monthly reports, as JSON. No key needed.",
};

const QUICK_START = [
  {
    label: "curl",
    code: `curl "${SITE_URL}/api/incidents?county=Nairobi&limit=5"`,
  },
  {
    label: "JavaScript",
    code: `const res = await fetch("${SITE_URL}/api/incidents?severity=critical&limit=10");
const { results } = await res.json();

for (const incident of results) {
  console.log(incident.reportedAt, incident.county, incident.title);
}`,
  },
  {
    label: "Python",
    code: `import requests

res = requests.get("${SITE_URL}/api/incidents", params={"category": "flood", "limit": 20})
res.raise_for_status()

for incident in res.json()["results"]:
    print(incident["reportedAt"], incident["county"], incident["title"])`,
  },
];

const FACTS = [
  { icon: KeyRound, label: "No API key", detail: "Call it straight away" },
  { icon: Globe, label: "Any website", detail: "CORS open for reads" },
  { icon: FileJson, label: "JSON", detail: "OpenAPI 3.1 spec" },
  { icon: Timer, label: "Fresh", detail: "Ingested hourly" },
];

export default function ApiDocsPage() {
  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">Developer API</p>
        <h1 className="mb-3 text-2xl font-semibold text-foreground sm:text-3xl">Deckwatch Kenya API</h1>
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          The same data behind this site, free to use in your own apps, maps, dashboards and research: real safety incidents
          from {NEWS_SOURCE_COUNT} Kenyan news and official sources, county figures and the monthly safety reports. Every endpoint below is live; press{" "}
          <span className="font-medium text-foreground">Try it</span> to send a real request.
        </p>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="rounded-xl border border-border bg-surface p-3">
              <f.icon className="mb-1.5 h-4 w-4 text-brand" />
              <p className="text-sm font-medium text-foreground">{f.label}</p>
              <p className="text-xs text-muted">{f.detail}</p>
            </div>
          ))}
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Base URL</span>
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{SITE_URL}</code>
          <CopyButton text={SITE_URL} />
          <a href="/api/openapi.json" className="text-xs font-medium text-brand hover:underline">
            OpenAPI spec
          </a>
        </div>

        <Section title="Quick start">
          <CodeTabs tabs={QUICK_START} />
        </Section>

        <Section title="Endpoints">
          <nav aria-label="Endpoints" className="mb-5 grid gap-1.5 sm:grid-cols-2">
            {API_ENDPOINTS.map((ep) => (
              <a
                key={ep.id}
                href={`#${ep.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                <MethodBadge method={ep.method} />
                <span className="truncate">{ep.title}</span>
              </a>
            ))}
          </nav>
          <div className="space-y-5">
            {API_ENDPOINTS.map((ep) => (
              <EndpointCard key={ep.id} ep={ep} />
            ))}
          </div>
        </Section>

        <Section title="Using the data">
          <div className="grid gap-4 sm:grid-cols-2">
            <Note title="Credit the sources">
              Deckwatch gathers what Kenyan media publish. Credit &ldquo;Deckwatch Kenya&rdquo; and, where you show an incident,
              link to the original articles in its <Code>sources</Code>.
            </Note>
            <Note title="Read the confidence">
              Most incidents come from one outlet and are marked <Code>unconfirmed</Code>. Locations that name only a county
              sit at its centre. Check <Code>verificationStatus</Code> and the sources before acting on any one report.
            </Note>
            <Note title="Freshness and caching">
              New articles are ingested hourly. Responses are cached for up to a minute (an hour for monthly
              reports), so polling more often than that only returns the same data.
            </Note>
            <Note title="Fair use">
              No key and no sign-up. Keep requests reasonable, cache on your side, and email{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=API%20access`} className="text-brand hover:underline">
                {CONTACT_EMAIL}
              </a>{" "}
              if you need heavy or bulk access. Abusive traffic may be blocked. Use is covered by the{" "}
              <a href="/terms#api" className="text-brand hover:underline">
                Terms of Use
              </a>
              .
            </Note>
          </div>
        </Section>

        <Section title="Errors">
          <p className="mb-3 text-sm leading-relaxed text-muted">
            Errors return a JSON body with one <Code>error</Code> message: <Code>400</Code> for an invalid parameter or body,{" "}
            <Code>404</Code> for an unknown incident, county or month. Errors are never cached.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
            {`// 400
{ "error": "Invalid limit \\"0\\". Expected a positive integer." }

// 404
{ "error": "Incident not found" }`}
          </pre>
        </Section>

        <p className="mt-10 flex items-center gap-2 text-xs text-muted">
          <Zap className="h-3.5 w-3.5 text-brand" />
          Version 1. New fields may be added to responses; existing ones won&rsquo;t change meaning without notice on the
          What&rsquo;s new page.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function MethodBadge({ method }: { method: ApiEndpoint["method"] }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
        method === "GET" ? "bg-brand/15 text-brand" : "bg-high/15 text-high"
      }`}
    >
      {method}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[12px] text-foreground">{children}</code>;
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function EndpointCard({ ep }: { ep: ApiEndpoint }) {
  return (
    <article id={ep.id} className="scroll-mt-6 space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={ep.method} />
          <code className="font-mono text-sm text-foreground">{ep.path}</code>
          {ep.cacheSeconds && (
            <span className="ml-auto font-mono text-[10px] text-muted">
              cached {ep.cacheSeconds >= 3600 ? `${ep.cacheSeconds / 3600} h` : ep.cacheSeconds >= 60 ? `${ep.cacheSeconds / 60} min` : `${ep.cacheSeconds} s`}
            </span>
          )}
        </div>
        <h3 className="text-base font-semibold text-foreground">{ep.title}</h3>
        <p className="text-sm leading-relaxed text-muted">{ep.summary}</p>
      </div>

      {ep.params.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                <th className="py-1.5 pr-3 font-medium">Parameter</th>
                <th className="py-1.5 pr-3 font-medium">In</th>
                <th className="py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {ep.params.map((p) => (
                <tr key={p.name} className="border-b border-border align-top">
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-[12px] text-foreground">
                    {p.name}
                    {(p.in === "path" || p.required) && <span className="text-critical"> *</span>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-muted">{p.in}</td>
                  <td className="py-2 text-muted">
                    {p.description}
                    {p.enum && (
                      <span className="mt-1 block font-mono text-[11px] text-foreground/70">One of: {p.enum.join(", ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ep.tryIt && <TryIt path={ep.tryIt.path} fill={"fill" in ep.tryIt ? ep.tryIt.fill : undefined} />}

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">Example response</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
          {ep.example}
        </pre>
      </details>
    </article>
  );
}
