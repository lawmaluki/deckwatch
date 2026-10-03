import type { Category, Incident, Severity } from "@/lib/types";

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

function roundPercentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

export function countyIncidentSummary(
  incidents: Incident[],
  asOfMs: number,
  days: number
) {
  const windowMs = days * 24 * 60 * 60 * 1000;
  const currentStart = asOfMs - windowMs;
  const previousStart = currentStart - windowMs;
  const current = incidents.filter((incident) => {
    const time = Date.parse(incident.reportedAt);
    return time >= currentStart && time < asOfMs;
  });
  const previous = incidents.filter((incident) => {
    const time = Date.parse(incident.reportedAt);
    return time >= previousStart && time < currentStart;
  });

  const countCategories = (items: Incident[]) => {
    const counts = new Map<Category, number>();
    for (const incident of items) {
      counts.set(incident.category, (counts.get(incident.category) ?? 0) + 1);
    }
    return counts;
  };
  const currentCategories = countCategories(current);
  const previousCategories = countCategories(previous);
  const categories = [...new Set([...currentCategories.keys(), ...previousCategories.keys()])]
    .sort(
      (a, b) =>
        (currentCategories.get(b) ?? 0) - (currentCategories.get(a) ?? 0) ||
        a.localeCompare(b)
    )
    .map((category) => {
      const count = currentCategories.get(category) ?? 0;
      const previousCount = previousCategories.get(category) ?? 0;
      return {
        category,
        count,
        previousCount,
        changePercent: roundPercentChange(count, previousCount),
      };
    });

  const daily = new Map<string, number>();
  for (let offset = days; offset >= 0; offset--) {
    const date = new Date(asOfMs - offset * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    daily.set(date, 0);
  }
  for (const incident of current) {
    const date = incident.reportedAt.slice(0, 10);
    if (daily.has(date)) daily.set(date, (daily.get(date) ?? 0) + 1);
  }

  return {
    periodDays: days,
    unit: "incidents" as const,
    total: current.length,
    previousTotal: previous.length,
    changePercent: roundPercentChange(current.length, previous.length),
    categories,
    severities: SEVERITIES.map((severity) => ({
      severity,
      count: current.filter((incident) => incident.severity === severity).length,
    })),
    dailyTrend: [...daily.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, count]) => ({ date, count })),
  };
}
