import { AlertTriangle, Flame, MapPinned, TrendingUp } from "lucide-react";
import { getIncidents, getReferenceTime } from "@/lib/incidents-source";
import { withinHours, summarizeByCounty, categoryBreakdown, dailyTrend, riskLabel } from "@/lib/stats";
import { CATEGORIES } from "@/lib/data/categories";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryBreakdownChart } from "@/components/dashboard/CategoryBreakdownChart";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { TopRiskCounties } from "@/components/dashboard/TopRiskCounties";
import { MiniHeatmap } from "@/components/map/MiniHeatmap";
import { IncidentListItem } from "@/components/incidents/IncidentListItem";
import { formatDateTime } from "@/lib/format";

export default async function NationalDashboardPage() {
  const incidents = await getIncidents();
  const last24h = incidents.filter((i) => withinHours(i, 24));
  const critical24h = last24h.filter((i) => i.severity === "critical");
  const countySummaries = summarizeByCounty(incidents);
  const topRisk = [...countySummaries].sort((a, b) => b.riskScore - a.riskScore)[0];
  const breakdown = categoryBreakdown(last24h.length ? last24h : incidents);
  const trend = dailyTrend(incidents, 14);
  const trendingCategory = breakdown[0];
  const recent = incidents.slice(0, 8);

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">National Dashboard</h1>
          <p className="text-sm text-muted">
            Kenya-wide incident intelligence · data as of {formatDateTime(getReferenceTime().toISOString())}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Incidents (24h)" value={last24h.length} icon={AlertTriangle} />
          <StatCard
            label="Critical (24h)"
            value={critical24h.length}
            icon={Flame}
            accent="var(--critical)"
          />
          <StatCard
            label="Highest risk county"
            value={topRisk?.county ?? "—"}
            icon={MapPinned}
            accent={topRisk ? riskLabel(topRisk.riskScore).color : undefined}
            sublabel={topRisk ? `${riskLabel(topRisk.riskScore).label} risk` : undefined}
          />
          <StatCard
            label="Trending category"
            value={trendingCategory ? CATEGORIES[trendingCategory.category].label : "—"}
            icon={TrendingUp}
            accent={trendingCategory ? CATEGORIES[trendingCategory.category].color : undefined}
            sublabel={trendingCategory ? `${trendingCategory.count} reports` : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-1 text-sm font-semibold text-foreground">14-day incident trend</h2>
              <p className="mb-2 text-xs text-muted">All categories, national aggregate</p>
              <TrendChart data={trend} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-1 text-sm font-semibold text-foreground">Category breakdown</h2>
              <p className="mb-2 text-xs text-muted">Last 24 hours</p>
              <CategoryBreakdownChart data={breakdown} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Recent incidents</h2>
              <div className="space-y-1.5">
                {recent.map((incident) => (
                  <IncidentListItem key={incident.id} incident={incident} />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">National heat map</h2>
              <div className="h-56">
                <MiniHeatmap incidents={incidents} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Highest risk counties</h2>
              <TopRiskCounties counties={countySummaries} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
