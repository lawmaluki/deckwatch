import { BACKEND_URL } from "@/lib/backend";
import { USE_API } from "@/lib/incidents-source";
import { COUNTY_BY_NAME } from "@/lib/data/counties";
import september2026 from "@/lib/data/monthly-reports/2026-09.json";
import october2026 from "@/lib/data/monthly-reports/2026-10.json";

// Monthly safety reports. The backend generates one per month on the last
// day (python -m app.monthly, scheduled in .github/workflows/monthly-report.yml)
// and stores it whole; this module reads it and derives the aggregates the
// report page shows. The document shape is built by
// backend/app/monthly/report.py::build_report — keep the two in step.

export type ReportCategory =
  | "security"
  | "road"
  | "fire"
  | "unrest"
  | "missing"
  | "collapse"
  | "weather"
  | "health"
  | "wildlife";

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  security: "Crime & security",
  road: "Road & transport",
  fire: "Fire & explosions",
  unrest: "Protests & unrest",
  missing: "Missing persons",
  collapse: "Building & mine collapses",
  weather: "Flooding & weather",
  health: "Animal & public health",
  wildlife: "Wildlife",
};

export interface ReportSource {
  name: string;
  url: string;
  title: string;
}

export interface ReportEvent {
  key: string;
  title: string;
  /** YYYY-MM-DD on the Kenyan calendar. */
  date: string;
  county: string;
  category: ReportCategory;
  /** Lowest figure reported across sources. */
  deaths: number;
  articles: number;
  outlets: string[];
  sources: ReportSource[];
  hotspot?: string;
  conflict?: string;
  /** Missing-person events only. */
  status?: string;
  defining?: boolean;
  why?: string;
}

export interface MonthlyReport {
  version: number;
  /** YYYY-MM */
  month: string;
  generatedAt: string;
  asOf: string;
  /** editorial: reviewed by hand; claude: consolidated by Claude;
   * automatic: one incident per article, unreviewed. */
  method: "editorial" | "claude" | "automatic";
  model?: string;
  /** First day of full coverage, when ingestion started partway through. */
  coverageFrom: string | null;
  articles: number;
  eventArticles: number;
  contextArticles: number;
  offTopic: number;
  autoMerged: number;
  statusCounts: Record<string, number>;
  outletCounts: [string, number][];
  catAgree: number;
  countyAgree: number;
  context: { key: string; label: string; count: number }[];
  /** Every article that is not one of the incidents, with the reason (a context
   * group label or "Off-topic"). Not shown on the page; the ingest classifier
   * learns from it (backend/app/ingest/examples.py). Absent on older reports. */
  setAside?: { title: string; url: string; reason: string }[];
  events: ReportEvent[];
  hotspots: { key: string; title: string; summary: string }[];
  watch: { title: string; body: string; action: string }[];
  headlines?: { month: string; what: string };
}

export interface ReportSummary {
  month: string;
  generatedAt: string;
  method: MonthlyReport["method"];
  incidents: number;
  counties: number;
  deaths: number;
  articles: number;
  headline: string;
}

// Reports bundled with the app: served when there is no backend (mock mode),
// or when it can't be reached. September 2026 is the hand-reviewed first issue.
const LOCAL_REPORTS: Record<string, MonthlyReport> = {
  // JSON imports widen tuples and unions, so the shape is asserted here; the
  // file is written by the backend builder, which is what guarantees it.
  "2026-09": september2026 as unknown as MonthlyReport,
  "2026-10": october2026 as unknown as MonthlyReport,
};

// Same rule as getIncidents(): the backend is only consulted in api mode.
const FROM_BACKEND = USE_API && !!BACKEND_URL;

// A report changes at most a few times on its last day, so an hour-old copy
// is fine; the list is refreshed sooner so a new month shows up promptly.
const REPORT_REVALIDATE_S = 3600;
const LIST_REVALIDATE_S = 600;

export function summarizeReport(r: MonthlyReport): ReportSummary {
  return {
    month: r.month,
    generatedAt: r.generatedAt,
    method: r.method,
    incidents: r.events.length,
    counties: new Set(r.events.map((e) => e.county)).size,
    deaths: r.events.reduce((s, e) => s + e.deaths, 0),
    articles: r.articles,
    headline: r.headlines?.month ?? "",
  };
}

function localList(): ReportSummary[] {
  return Object.values(LOCAL_REPORTS)
    .map(summarizeReport)
    .sort((a, b) => b.month.localeCompare(a.month));
}

export async function listMonthlyReports(): Promise<ReportSummary[]> {
  if (!FROM_BACKEND) return localList();
  try {
    const res = await fetch(`${BACKEND_URL}/monthly-reports`, {
      next: { revalidate: LIST_REVALIDATE_S },
    });
    if (!res.ok) return localList();
    const body = (await res.json()) as { results: ReportSummary[] };
    // A bundled report the backend doesn't have yet (e.g. before the first
    // import) still gets listed.
    const byMonth = new Map(localList().map((s) => [s.month, s]));
    for (const s of body.results) byMonth.set(s.month, s);
    return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
  } catch (err) {
    console.error("listMonthlyReports: backend fetch failed, using bundled reports", err);
    return localList();
  }
}

export async function getMonthlyReport(month: string): Promise<MonthlyReport | null> {
  if (!isMonth(month)) return null;
  if (!FROM_BACKEND) return LOCAL_REPORTS[month] ?? null;
  try {
    const res = await fetch(`${BACKEND_URL}/monthly-reports/${month}`, {
      next: { revalidate: REPORT_REVALIDATE_S },
    });
    if (!res.ok) return LOCAL_REPORTS[month] ?? null;
    return (await res.json()) as MonthlyReport;
  } catch (err) {
    console.error(`getMonthlyReport(${month}): backend fetch failed`, err);
    return LOCAL_REPORTS[month] ?? null;
  }
}

// --- calendar ------------------------------------------------------------------

export function isMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Month names come from a fixed table, not Intl: ICU versions disagree on
// short forms ("Sep" vs "Sept"), and the server and the browser can carry
// different ones, which would make these strings a hydration mismatch.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "16 Sep" from "2026-09-16". */
export function formatDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

export function countyCode(county: string): string {
  const code = COUNTY_BY_NAME[county]?.code;
  return code === undefined ? "" : String(code).padStart(3, "0");
}

// --- derivations -----------------------------------------------------------------

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

export function totalDeaths(events: ReportEvent[]): number {
  return sum(events, (e) => e.deaths);
}

export interface CategoryRow {
  category: ReportCategory;
  incidents: number;
  deaths: number;
}

export function byCategory(events: ReportEvent[]): CategoryRow[] {
  const m = new Map<ReportCategory, CategoryRow>();
  for (const e of events) {
    const row = m.get(e.category) ?? { category: e.category, incidents: 0, deaths: 0 };
    row.incidents++;
    row.deaths += e.deaths;
    m.set(e.category, row);
  }
  return [...m.values()].sort((a, b) => b.incidents - a.incidents || b.deaths - a.deaths);
}

export interface CountyRow {
  county: string;
  code: string;
  incidents: number;
  deaths: number;
  /** Category with the most incidents, deaths breaking ties. */
  mainConcern: ReportCategory;
  events: ReportEvent[];
}

export function byCounty(events: ReportEvent[]): CountyRow[] {
  const m = new Map<string, ReportEvent[]>();
  for (const e of events) m.set(e.county, [...(m.get(e.county) ?? []), e]);
  return [...m.entries()]
    .map(([county, evs]) => ({
      county,
      code: countyCode(county),
      incidents: evs.length,
      deaths: totalDeaths(evs),
      mainConcern: byCategory(evs)[0].category,
      events: [...evs].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.incidents - a.incidents || b.deaths - a.deaths || a.county.localeCompare(b.county));
}

export interface DayRow {
  day: number;
  date: string;
  incidents: number;
  deaths: number;
  events: ReportEvent[];
}

export function byDay(report: MonthlyReport): DayRow[] {
  return Array.from({ length: daysInMonth(report.month) }, (_, i) => {
    const date = `${report.month}-${String(i + 1).padStart(2, "0")}`;
    const events = report.events.filter((e) => e.date === date);
    return { day: i + 1, date, incidents: events.length, deaths: totalDeaths(events), events };
  });
}

export interface WeekRow {
  label: string;
  days: number;
  incidents: number;
  deaths: number;
  /** The week's deadliest incidents, most deaths first. */
  top: ReportEvent[];
}

/** Rows the report's county table shows; its "Top N shown" note reads it too.
 * Lives here, not in the client component, so the server page gets the value. */
export const COUNTY_TABLE_LIMIT = 12;

/** Day of the month full coverage starts (1 when it was complete). */
export function coverageStartDay(report: MonthlyReport): number {
  return report.coverageFrom ? Number(report.coverageFrom.slice(8, 10)) : 1;
}

/** Seven-day blocks from the start of full coverage; the last block holds
 * whatever days remain, so compare weeks per day, not in total. Pass `days`
 * when byDay has already run. */
export function byWeek(report: MonthlyReport, days: DayRow[] = byDay(report)): WeekRow[] {
  const from = coverageStartDay(report);
  const weeks: WeekRow[] = [];
  for (let start = from; start <= days.length; start += 7) {
    const block = days.slice(start - 1, Math.min(start + 6, days.length));
    const events = block.flatMap((d) => d.events);
    const first = block[0].date;
    const last = block[block.length - 1].date;
    weeks.push({
      label: `${formatDay(first).split(" ")[0]}–${formatDay(last)}`,
      days: block.length,
      incidents: events.length,
      deaths: totalDeaths(events),
      top: [...events].sort((a, b) => b.deaths - a.deaths || b.articles - a.articles).slice(0, 3),
    });
  }
  return weeks;
}

export interface CategoryChange {
  category: ReportCategory;
  current: number;
  previous: number;
  /** Percentage change, or null when the previous month had none. */
  pct: number | null;
}

export function changeFromPrevious(report: MonthlyReport, prev: MonthlyReport): CategoryChange[] {
  const cur = new Map(byCategory(report.events).map((r) => [r.category, r.incidents]));
  const old = new Map(byCategory(prev.events).map((r) => [r.category, r.incidents]));
  const cats = new Set<ReportCategory>([...cur.keys(), ...old.keys()]);
  return [...cats]
    .map((category) => {
      const current = cur.get(category) ?? 0;
      const previous = old.get(category) ?? 0;
      return {
        category,
        current,
        previous,
        pct: previous ? Math.round(((current - previous) / previous) * 100) : null,
      };
    })
    .sort((a, b) => b.current - a.current || b.previous - a.previous);
}

export function confidenceLabel(e: ReportEvent): { label: string; strong: boolean } {
  const n = e.outlets.length;
  if (n >= 3) return { label: `${n} outlets`, strong: true };
  if (n === 2) return { label: "2 outlets", strong: false };
  return { label: "Single outlet", strong: false };
}

export const METHOD_LABELS: Record<MonthlyReport["method"], string> = {
  editorial: "Reviewed by hand",
  claude: "Consolidated by Claude",
  automatic: "Automatic, unreviewed",
};
