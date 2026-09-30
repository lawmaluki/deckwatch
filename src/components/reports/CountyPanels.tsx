"use client";

import clsx from "clsx";
import {
  REPORT_CATEGORY_LABELS,
  byCategory,
  formatDay,
  type CountyRow,
} from "@/lib/monthly-reports";
import { COUNTY_BRIEF_ID, useReportSelection } from "@/components/reports/ReportSelection";

export function CountyTable({ counties, limit = 12 }: { counties: CountyRow[]; limit?: number }) {
  const { county: selected, select } = useReportSelection();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border font-mono text-[11px] uppercase tracking-wider text-muted">
            <th className="px-2.5 py-2 text-left font-medium">County</th>
            <th className="px-2.5 py-2 text-right font-medium">Incidents</th>
            <th className="px-2.5 py-2 text-right font-medium">Deaths</th>
            <th className="px-2.5 py-2 text-left font-medium">Main concern</th>
          </tr>
        </thead>
        <tbody>
          {counties.slice(0, limit).map((c) => (
            <tr
              key={c.county}
              onClick={() => select(c.county, { scroll: true })}
              className={clsx(
                "cursor-pointer border-b border-border transition-colors hover:bg-surface-raised",
                c.county === selected && "bg-surface-raised"
              )}
            >
              <td className="px-2.5 py-2">
                <span className="mr-2 font-mono text-[11px] text-muted/70">{c.code}</span>
                {c.county}
              </td>
              <td className="px-2.5 py-2 text-right font-mono tabular-nums">{c.incidents}</td>
              <td className="px-2.5 py-2 text-right font-mono tabular-nums">{c.deaths}</td>
              <td className="px-2.5 py-2 text-muted">{REPORT_CATEGORY_LABELS[c.mainConcern]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CountyBrief({ counties, monthLabel }: { counties: CountyRow[]; monthLabel: string }) {
  const { county: selected, select } = useReportSelection();
  const row = counties.find((c) => c.county === selected) ?? counties[0];
  if (!row) return null;
  const rank = counties.indexOf(row) + 1;
  const cats = byCategory(row.events).slice(0, 2);
  const perDay = new Map<string, number>();
  for (const e of row.events) perDay.set(e.date, (perDay.get(e.date) ?? 0) + 1);
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const open = row.events.filter((e) => e.status === "Open").length;
  const sorted = [...counties].sort((a, b) => a.county.localeCompare(b.county));

  return (
    <div id={COUNTY_BRIEF_ID} className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="report-county" className="font-mono text-[11px] uppercase tracking-wider text-muted">
          County
        </label>
        <select
          id="report-county"
          value={row.county}
          onChange={(e) => select(e.target.value)}
          className="min-w-[220px] max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
        >
          {sorted.map((c) => (
            <option key={c.county} value={c.county}>
              {c.county} ({c.incidents})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-surface p-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            County {row.code} · Rank {rank} of {counties.length} by incidents
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {row.county}, {monthLabel}
          </h3>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact value={row.incidents} label="incidents captured" />
          <Fact value={row.deaths} label="deaths reported" />
          <Fact
            value={cats.map((c) => c.incidents).join(" / ")}
            label={cats.map((c) => REPORT_CATEGORY_LABELS[c.category]).join(" / ")}
          />
          {busiest && busiest[1] > 1 ? (
            <Fact value={formatDay(busiest[0])} label={`busiest day (${busiest[1]} incidents)`} />
          ) : (
            <Fact value="—" label="no day with 2+ incidents" />
          )}
          {open > 0 && <Fact value={open} label="missing-person cases still open" />}
        </dl>
        <ul className="divide-y divide-border border-t border-border">
          {row.events.map((e) => (
            <li key={e.key} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-2.5 text-sm sm:grid-cols-[52px_minmax(0,1fr)_auto]">
              <span className="font-mono text-xs text-muted/70">{formatDay(e.date)}</span>
              <a href={e.sources[0]?.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-brand">
                {e.title}
              </a>
              <span className="col-start-2 whitespace-nowrap font-mono text-[11px] text-muted sm:col-start-3">
                {REPORT_CATEGORY_LABELS[e.category]}
                {e.deaths ? ` · ${e.deaths} dead` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Fact({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <dt className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</dt>
      <dd className="text-xs text-muted">{label}</dd>
    </div>
  );
}
