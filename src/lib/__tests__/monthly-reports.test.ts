import { describe, expect, it } from "vitest";
import sept from "@/lib/data/monthly-reports/2026-09.json";
import {
  byCategory,
  byCounty,
  byDay,
  byWeek,
  changeFromPrevious,
  confidenceLabel,
  daysInMonth,
  formatDay,
  formatMonth,
  getMonthlyReport,
  isMonth,
  listMonthlyReports,
  nextMonth,
  previousMonth,
  summarizeReport,
  totalDeaths,
  type MonthlyReport,
} from "@/lib/monthly-reports";

const report = sept as unknown as MonthlyReport;

describe("calendar helpers", () => {
  it("steps across year boundaries", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(nextMonth("2026-09")).toBe("2026-10");
  });

  it("validates month params", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("../etc")).toBe(false);
  });

  it("formats months and days", () => {
    expect(formatMonth("2026-09")).toBe("September 2026");
    expect(formatDay("2026-09-16")).toBe("16 Sep");
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("September 2026 report", () => {
  it("matches the published headline figures", () => {
    expect(summarizeReport(report)).toMatchObject({ incidents: 105, counties: 37, deaths: 93, articles: 369 });
    expect(report.eventArticles + report.contextArticles + report.offTopic).toBe(report.articles);
  });

  it("breaks down by category, most incidents first", () => {
    const cats = byCategory(report.events);
    expect(cats[0]).toEqual({ category: "security", incidents: 50, deaths: 35 });
    expect(cats.find((c) => c.category === "road")?.deaths).toBe(37);
    expect(cats.reduce((s, c) => s + c.incidents, 0)).toBe(105);
  });

  it("ranks counties by incidents and keeps county codes", () => {
    const counties = byCounty(report.events);
    expect(counties[0]).toMatchObject({ county: "Nairobi", code: "047", incidents: 17 });
    const isiolo = counties.find((c) => c.county === "Isiolo")!;
    expect(isiolo.deaths).toBe(13);
    expect(isiolo.events.map((e) => e.date)).toEqual([...isiolo.events.map((e) => e.date)].sort());
  });

  it("covers every day of the month", () => {
    const days = byDay(report);
    expect(days).toHaveLength(30);
    expect(days.reduce((s, d) => s + d.incidents, 0)).toBe(105);
    expect(days.reduce((a, b) => (b.incidents > a.incidents ? b : a)).day).toBe(21);
  });

  it("splits weeks from the start of full coverage", () => {
    const weeks = byWeek(report);
    expect(report.coverageFrom).toBe("2026-09-12");
    expect(weeks.map((w) => [w.label, w.days, w.incidents])).toEqual([
      ["12–18 Sep", 7, 41],
      ["19–25 Sep", 7, 42],
      ["26–30 Sep", 5, 17],
    ]);
    expect(weeks[0].top[0].deaths).toBe(5);
  });

  it("labels corroboration by outlet count", () => {
    const air = report.events.find((e) => e.key === "kajiado-air")!;
    expect(confidenceLabel(air)).toEqual({ label: "10 outlets", strong: true });
    expect(totalDeaths([air])).toBe(2);
  });
});

describe("changeFromPrevious", () => {
  it("reports percentage change per category and marks new ones", () => {
    const prev: MonthlyReport = {
      ...report,
      month: "2026-08",
      events: report.events.filter((e) => e.category === "road").slice(0, 10),
    };
    const rows = changeFromPrevious(report, prev);
    expect(rows.find((r) => r.category === "road")).toEqual({ category: "road", current: 19, previous: 10, pct: 90 });
    expect(rows.find((r) => r.category === "security")?.pct).toBeNull();
  });
});

describe("report source (no backend)", () => {
  it("serves the bundled report and lists it", async () => {
    expect((await getMonthlyReport("2026-09"))?.events).toHaveLength(105);
    expect(await getMonthlyReport("2026-08")).toBeNull();
    expect(await getMonthlyReport("not-a-month")).toBeNull();
    expect((await listMonthlyReports()).map((r) => r.month)).toContain("2026-09");
  });
});
