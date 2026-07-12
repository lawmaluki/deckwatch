
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Clock } from "lucide-react";
import { COUNTIES, COUNTY_BY_SLUG } from "@/lib/data/counties";
import { connection } from "next/server";
import { getIncidents, USE_API } from "@/lib/incidents-source";
import { withinHours, categoryBreakdown, dailyTrend, countyRiskScore } from "@/lib/stats";
import { RiskGauge } from "@/components/dashboard/RiskGauge";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryBreakdownChart } from "@/components/dashboard/CategoryBreakdownChart";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { IncidentListItem } from "@/components/incidents/IncidentListItem";
import { MiniHeatmap } from "@/components/map/MiniHeatmap";
import { CATEGORIES } from "@/lib/data/categories";

export function generateStaticParams() {
  return COUNTIES.map((c) => ({ slug: c.slug }));
}

export default async function CountyDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (USE_API) await connection();
  const { slug } = await params;
  const county = COUNTY_BY_SLUG[slug];
  if (!county) notFound();

  const allIncidents = await getIncidents();
  const incidents = allIncidents.filter((i) => i.county === county.name);
  const last24h = incidents.filter((i) => withinHours(i, 24));
  const riskScore = countyRiskScore(incidents);
  const breakdown = categoryBreakdown(incidents);
  const trend = dailyTrend(incidents, 14);
  const topCategory = breakdown[0];

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/counties" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All counties
        </Link>

        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{county.name} County</h1>
            <p className="text-sm text-muted">{incidents.length} tracked incidents in this dataset</p>
          </div>
          <RiskGauge score={riskScore} />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Active incidents (24h)" value={last24h.length} icon={AlertTriangle} />
          <StatCard
            label="Most common category"
            value={topCategory ? CATEGORIES[topCategory.category].label : "—"}
            icon={Clock}
            accent={topCategory ? CATEGORIES[topCategory.category].color : undefined}
            sublabel={topCategory ? `${topCategory.count} reports` : undefined}
          />
          <StatCard label="Total tracked" value={incidents.length} icon={AlertTriangle} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-1 text-sm font-semibold text-foreground">14-day trend</h2>
              <TrendChart data={trend} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-1 text-sm font-semibold text-foreground">Category breakdown</h2>
              {breakdown.length > 0 ? (
                <CategoryBreakdownChart data={breakdown} />
              ) : (
                <p className="py-8 text-center text-xs text-muted">No incidents recorded.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">County map</h2>
              <div className="h-56">
                <MiniHeatmap incidents={incidents} center={county.center} zoom={8} minZoom={6} maxZoom={12} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Active incidents</h2>
              <div className="space-y-1.5">
                {incidents.slice(0, 10).map((incident) => (
                  <IncidentListItem key={incident.id} incident={incident} />
                ))}
                {incidents.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted">No incidents recorded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
