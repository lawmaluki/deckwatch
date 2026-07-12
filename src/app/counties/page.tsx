import Link from "next/link";
import { COUNTIES } from "@/lib/data/counties";
import { connection } from "next/server";
import { getIncidents, USE_API } from "@/lib/incidents-source";
import { summarizeByCounty, riskLabel, withinHours } from "@/lib/stats";

export default async function CountiesIndexPage() {
  if (USE_API) await connection();
  const incidents = await getIncidents();
  const summaries = summarizeByCounty(incidents);
  const summaryByName = new Map(summaries.map((s) => [s.county, s]));

  const rows = COUNTIES.map((c) => {
    const summary = summaryByName.get(c.name);
    return {
      county: c,
      total: summary?.total ?? 0,
      last24h: summary?.last24h ?? 0,
      riskScore: summary?.riskScore ?? 0,
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Counties</h1>
          <p className="text-sm text-muted">
            All 47 counties ranked by current risk score. Active incidents in the last 24 hours: {" "}
            {incidents.filter((i) => withinHours(i, 24)).length}.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ county, total, last24h, riskScore }) => {
            const { label, color } = riskLabel(riskScore);
            return (
              <Link
                key={county.slug}
                href={`/county/${county.slug}`}
                className="rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand/40 hover:bg-surface-raised"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h2 className="text-sm font-semibold text-foreground">{county.name}</h2>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ color, backgroundColor: `${color}1a` }}
                  >
                    {label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{total} total incidents</span>
                  <span>{last24h} in 24h</span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(4, riskScore)}%`, backgroundColor: color }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
