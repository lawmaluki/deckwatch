import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  sublabel,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <Icon className="h-4 w-4" style={{ color: accent ?? "var(--brand)" }} />
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      {sublabel && <p className="mt-1 text-[11px] text-muted">{sublabel}</p>}
    </div>
  );
}
