import Link from "next/link";
import { CATEGORIES } from "@/lib/data/categories";
import { COUNTY_BY_NAME } from "@/lib/data/counties";
import { riskLabel } from "@/lib/stats";
import type { CountySummary } from "@/lib/stats";

export function TopRiskCounties({ counties }: { counties: CountySummary[] }) {
  const sorted = [...counties].sort((a, b) => b.riskScore - a.riskScore).slice(0, 8);

  return (
    <div className="divide-y divide-border">
      {sorted.map((c, idx) => {
        const { label, color } = riskLabel(c.riskScore);
        const slug = COUNTY_BY_NAME[c.county]?.slug ?? "";
        return (
          <Link
            key={c.county}
            href={`/county/${slug}`}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
          >
            <span className="w-5 text-xs font-medium text-muted">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{c.county}</p>
              <p className="truncate text-[11px] text-muted">
                {c.total} incidents
                {c.topCategory ? ` · mostly ${CATEGORIES[c.topCategory].label.toLowerCase()}` : ""}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ color, backgroundColor: `${color}1a` }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
