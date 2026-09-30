import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { METHOD_LABELS, formatMonth, listMonthlyReports } from "@/lib/monthly-reports";

export const metadata: Metadata = {
  title: "Monthly safety reports · Deckwatch Kenya",
  description: "A monthly brief on what happened in Kenya, where it happened, and what changed.",
};

export default async function MonthlyReportsIndexPage() {
  const reports = await listMonthlyReports();

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Monthly safety reports</h1>
          <p className="max-w-2xl text-sm text-muted">
            Every month Deckwatch groups the news it captured into distinct incidents and publishes what happened, where it happened and
            what changed. A new report is published on the last day of each month.
          </p>
        </div>

        {reports.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
            The first report will appear here on the last day of the month.
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.month}>
                <Link
                  href={`/dashboard/reports/${r.month}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand/40 hover:bg-surface-raised"
                >
                  <FileText className="h-5 w-5 flex-none text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground">{formatMonth(r.month)}</p>
                    {r.headline && <p className="truncate text-sm text-muted">{r.headline}</p>}
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {r.incidents} incidents · {r.counties} counties · {r.deaths}+ deaths · {METHOD_LABELS[r.method]}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-none text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
