
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Clock } from "lucide-react";
import { COUNTIES, COUNTY_BY_SLUG } from "@/lib/data/counties";
import { connection } from "next/server";
import { getIncidents, USE_API } from "@/lib/incidents-source";
import {
  withinHours,
  categoryBreakdown,
  dailyTrend,
  countyRiskScore,
  riskLabel,
} from "@/lib/stats";
import { RiskGauge } from "@/components/dashboard/RiskGauge";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryBreakdownChart } from "@/components/dashboard/CategoryBreakdownChart";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { RecentIncidents } from "@/components/dashboard/RecentIncidents";
import { MiniHeatmap } from "@/components/map/MiniHeatmap";
import { CATEGORIES, SEVERITY_CONFIG } from "@/lib/data/categories";
import type { Severity } from "@/lib/types";

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
  const { label: riskLevel, color: riskColor } = riskLabel(riskScore);
  const breakdown = categoryBreakdown(incidents);
  const trend = dailyTrend(incidents, 14);
  const topCategory = breakdown[0];

  // Most severe first, so a reader scanning the header sees what's driving
  // the score before what's merely on record.
  const severityCounts = (Object.keys(SEVERITY_CONFIG) as Severity[])
    .map((id) => ({ id, ...SEVERITY_CONFIG[id], count: incidents.filter((i) => i.severity === id).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.order - a.order);

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/counties" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All counties
        </Link>

        <div className="mb-6 flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{county.name} County</h1>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ color: riskColor, backgroundColor: `${riskColor}1a` }}
              >
                {riskLevel} risk
              </span>
            </div>
            <p className="text-sm text-muted">{incidents.length} tracked incidents</p>

            {severityCounts.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                {severityCounts.map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.count} {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="self-center sm:self-auto">
            <RiskGauge score={riskScore} />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="Active incidents (24h)"
            value={last24h.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            action={{ kind: "county", value: county.name }}
          />
          <StatCard
            label="Most common category"
            value={topCategory ? CATEGORIES[topCategory.category].label : "—"}
            icon={<Clock className="h-4 w-4" />}
            accent={topCategory ? CATEGORIES[topCategory.category].color : undefined}
            sublabel={topCategory ? `${topCategory.count} reports` : undefined}
            action={
              topCategory ? { kind: "category", value: topCategory.category } : undefined
            }
          />
          <StatCard
            label="Total tracked"
            value={incidents.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            action={{ kind: "county", value: county.name }}
          />
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
              {incidents.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">No incidents recorded.</p>
              ) : (
                <RecentIncidents incidents={incidents.slice(0, 10)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
