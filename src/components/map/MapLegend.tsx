import { SEVERITY_LIST } from "@/lib/data/categories";

export function MapLegend() {
  return (
    <div className="glass-panel pointer-events-auto rounded-xl px-3 py-2.5 text-xs">
      <p className="mb-1.5 font-medium text-muted">Severity</p>
      <div className="flex items-center gap-3">
        {SEVERITY_LIST.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-foreground/90">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
