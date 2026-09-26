import type { Metadata } from "next";
import { AlertTriangle, Flame, MapPinned, TrendingUp } from "lucide-react";
import { connection } from "next/server";
import { readIncidents, getReferenceTime, USE_API } from "@/lib/incidents-source";
import { DataUnavailableNotice } from "@/components/layout/DataUnavailableNotice";
import { withinHours, summarizeByCounty, categoryBreakdown, dailyTrend, riskLabel } from "@/lib/stats";
import { CATEGORIES } from "@/lib/data/categories";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryBreakdownChart } from "@/components/dashboard/CategoryBreakdownChart";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { TopRiskCounties } from "@/components/dashboard/TopRiskCounties";
import { RecentIncidents } from "@/components/dashboard/RecentIncidents";
import { FocusButton } from "@/components/dashboard/FocusButton";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";
import { MiniHeatmap } from "@/components/map/MiniHeatmap";
import { COUNTY_BY_NAME } from "@/lib/data/counties";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "National Dashboard",
  description:
    "Kenya-wide incident intelligence: severity breakdown, 14-day trend, category mix and the counties carrying the most risk right now.",
};

export default async function NationalDashboardPage() {
  // Live data must be re-anchored per request; mock builds inline USE_API to
  // false and stay fully static.
  if (USE_API) await connection();
  const { incidents, unavailable } = await readIncidents();
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
      <LiveRefresh />
      <div className="mx-auto max-w-6xl">
        {unavailable && <DataUnavailableNotice />}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">National Dashboard</h1>
          <p className="text-sm text-muted">
            Kenya-wide incident intelligence · data as of {formatDateTime(getReferenceTime().toISOString())}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Incidents (24h)"
            value={last24h.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            action={{ kind: "all" }}
          />
          <StatCard
            label="Critical (24h)"
            value={critical24h.length}
            icon={<Flame className="h-4 w-4" />}
            accent="var(--critical)"
            action={{ kind: "severity", value: "critical" }}
          />
          <StatCard
            label="Highest risk county"
            value={topRisk?.county ?? "—"}
            icon={<MapPinned className="h-4 w-4" />}
            accent={topRisk ? riskLabel(topRisk.riskScore).color : undefined}
            sublabel={topRisk ? `${riskLabel(topRisk.riskScore).label} risk` : undefined}
            href={
              topRisk && COUNTY_BY_NAME[topRisk.county]
                ? `/county/${COUNTY_BY_NAME[topRisk.county].slug}`
                : undefined
            }
          />
          <StatCard
            label="Trending category"
            value={trendingCategory ? CATEGORIES[trendingCategory.category].label : "—"}
            icon={<TrendingUp className="h-4 w-4" />}
            accent={trendingCategory ? CATEGORIES[trendingCategory.category].color : undefined}
            sublabel={trendingCategory ? `${trendingCategory.count} reports` : undefined}
            action={
              trendingCategory
                ? { kind: "category", value: trendingCategory.category }
                : undefined
            }
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
              <p className="mb-2 text-xs text-muted">
                Last 24 hours · select a bar to map that category
              </p>
              <CategoryBreakdownChart data={breakdown} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">Recent incidents</h2>
                <FocusButton action={{ kind: "all" }}>All incidents</FocusButton>
              </div>
              <RecentIncidents incidents={recent} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">National heat map</h2>
                <FocusButton action={{ kind: "heatmap" }}>Open</FocusButton>
              </div>
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
