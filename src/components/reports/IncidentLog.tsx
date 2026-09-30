"use client";

import { useState } from "react";
import {
  REPORT_CATEGORY_LABELS,
  formatDay,
  type CategoryRow,
  type ReportCategory,
  type ReportEvent,
} from "@/lib/monthly-reports";

export function IncidentLog({ events, categories }: { events: ReportEvent[]; categories: CategoryRow[] }) {
  const [filter, setFilter] = useState<ReportCategory | "all">("all");
  const shown = filter === "all" ? events : events.filter((e) => e.category === filter);
  const options: [ReportCategory | "all", string][] = [
    ["all", "All"],
    ...categories.map((c): [ReportCategory, string] => [c.category, `${REPORT_CATEGORY_LABELS[c.category]} ${c.incidents}`]),
  ];

  return (
    <details className="rounded-2xl border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3.5 text-sm font-medium text-foreground">
        All {events.length} incidents in this report
      </summary>
      <div className="space-y-3 border-t border-border px-2 pb-3 pt-3">
        <div className="flex flex-wrap gap-1.5 px-2" role="group" aria-label="Filter by category">
          {options.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={
                filter === k
                  ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-xs text-background"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border font-mono text-[11px] uppercase tracking-wider text-muted">
                <th className="px-2.5 py-2 text-left font-medium">Date</th>
                <th className="px-2.5 py-2 text-left font-medium">Incident</th>
                <th className="px-2.5 py-2 text-left font-medium">County</th>
                <th className="px-2.5 py-2 text-right font-medium">Deaths</th>
                <th className="px-2.5 py-2 text-right font-medium">Outlets</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.key} className="border-b border-border align-top">
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-xs text-muted">{formatDay(e.date)}</td>
                  <td className="px-2.5 py-2">
                    <a href={e.sources[0]?.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-brand">
                      {e.title}
                    </a>
                    <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wider text-muted">
                      {REPORT_CATEGORY_LABELS[e.category]}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2">{e.county}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{e.deaths || "–"}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{e.outlets.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
