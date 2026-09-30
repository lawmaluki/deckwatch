import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { formatMonth, type ReportSummary } from "@/lib/monthly-reports";

// Dashboard entry point to the monthly reports: the newest one, front and
// centre, with the archive one link away.
export function LatestReportCard({ latest }: { latest: ReportSummary | undefined }) {
  if (!latest) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
      <Link href={`/dashboard/reports/${latest.month}`} className="group flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand/10 text-brand">
          <FileText className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium text-muted">Monthly safety report</span>
          <span className="block text-sm font-semibold text-foreground group-hover:text-brand">
            {formatMonth(latest.month)}: {latest.incidents} incidents in {latest.counties} counties
          </span>
          {latest.headline && <span className="block truncate text-xs text-muted">{latest.headline}</span>}
        </span>
      </Link>
      <div className="flex items-center gap-2 text-xs">
        <Link href="/dashboard/reports" className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-raised hover:text-foreground">
          All reports
        </Link>
        <Link
          href={`/dashboard/reports/${latest.month}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 font-medium text-black hover:bg-brand-dim"
        >
          Read report <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
