import { SEVERITY_CONFIG } from "@/lib/data/categories";
import type { Severity } from "@/lib/types";
import clsx from "clsx";

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={clsx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: SEVERITY_CONFIG[severity].color }}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ borderColor: `${config.color}55`, backgroundColor: `${config.color}1a`, color: config.color }}
    >
      <SeverityDot severity={severity} />
      {config.label}
    </span>
  );
}
