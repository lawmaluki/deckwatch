import type { Category, Incident, Severity } from "@/lib/types";
import { DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { SEVERITY_CONFIG } from "@/lib/data/categories";
import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/constants";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1,
  medium: 2.5,
  high: 5,
  critical: 9,
};

export function hoursAgo(incident: Incident): number {
  return (
    (DATA_REFERENCE_TIME.getTime() - new Date(incident.reportedAt).getTime()) /
    MS_PER_HOUR
  );
}

export function withinHours(incident: Incident, hours: number): boolean {
  return hoursAgo(incident) <= hours;
}

export function countyRiskScore(incidents: Incident[]): number {
  if (incidents.length === 0) return 0;
  const raw = incidents.reduce((sum, i) => {
    const recency = Math.max(0.15, 1 - hoursAgo(i) / (24 * 30));
    return sum + SEVERITY_WEIGHT[i.severity] * recency;
  }, 0);
  // Log-dampened so a handful of incidents doesn't saturate the scale the
  // same way dozens do — keeps the Low/Moderate/High/Critical bands meaningful.
  const score = 24 * Math.log2(1 + raw / 4);
  return Math.min(100, Math.round(score));
}

export function riskLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "Critical", color: SEVERITY_CONFIG.critical.color };
  if (score >= 40) return { label: "High", color: SEVERITY_CONFIG.high.color };
  if (score >= 15) return { label: "Moderate", color: SEVERITY_CONFIG.medium.color };
  return { label: "Low", color: SEVERITY_CONFIG.low.color };
}

export interface CountySummary {
  county: string;
  total: number;
  last24h: number;
  riskScore: number;
  topCategory: Category | null;
}

export function summarizeByCounty(incidents: Incident[]): CountySummary[] {
  const groups = new Map<string, Incident[]>();
  for (const incident of incidents) {
    const list = groups.get(incident.county) ?? [];
    list.push(incident);
    groups.set(incident.county, list);
  }

  return Array.from(groups.entries()).map(([county, list]) => {
    const categoryCounts = new Map<Category, number>();
    for (const i of list) {
      categoryCounts.set(i.category, (categoryCounts.get(i.category) ?? 0) + 1);
    }
    let topCategory: Category | null = null;
    let topCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > topCount) {
        topCount = count;
        topCategory = cat;
      }
    }

    return {
      county,
      total: list.length,
      last24h: list.filter((i) => withinHours(i, 24)).length,
      riskScore: countyRiskScore(list),
      topCategory,
    };
  });
}

export function categoryBreakdown(
  incidents: Incident[]
): { category: Category; count: number }[] {
  const counts = new Map<Category, number>();
  for (const i of incidents) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function dailyTrend(
  incidents: Incident[],
  days = 14
): { date: string; count: number }[] {
  const buckets = new Map<string, number>();
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(DATA_REFERENCE_TIME.getTime() - d * MS_PER_DAY);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const i of incidents) {
    const key = i.reportedAt.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}
