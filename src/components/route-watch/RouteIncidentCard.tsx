"use client";

import clsx from "clsx";
import { CATEGORIES } from "@/lib/data/categories";
import { SeverityDot } from "@/components/incidents/SeverityBadge";
import { VerificationBadge } from "@/components/incidents/VerificationBadge";
import { useMapFocus } from "@/hooks/useMapFocus";
import { relativeTime } from "@/lib/format";
import { formatKm, placementLabel, type RouteMatch } from "@/lib/route-watch";

/** One incident along the route, answering the four questions a traveller
 * has: where (on my route or near it), what (and who says so), when, and is
 * it still going on — which Deckwatch can't know, and says. */
export function RouteIncidentCard({
  match,
  routeKm,
  active,
  onSelect,
}: {
  match: RouteMatch;
  routeKm: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { incident } = match;
  const category = CATEGORIES[incident.category];
  const Icon = category.icon;
  const focus = useMapFocus();
  const sources = incident.sources.map((s) => s.name);

  return (
    <article
      className={clsx(
        "rounded-lg border px-3 py-3 transition-colors",
        active ? "border-brand/50 bg-brand/10" : "border-border bg-surface hover:bg-surface-raised"
      )}
    >
      <button onClick={onSelect} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span
            className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: category.color }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{category.label}</span>
          </span>
          <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted">
            km {Math.round(match.alongKm)} of {Math.round(routeKm)}
          </span>
        </div>
        <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-foreground">
          <SeverityDot severity={incident.severity} className="mt-1.5" />
          <span>{incident.title}</span>
        </p>
        <p className="mt-1 text-xs text-muted">{placementLabel(match, incident.locationName)}</p>
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
        <span suppressHydrationWarning>Reported {relativeTime(incident.reportedAt)}</span>
        <VerificationBadge status={incident.verificationStatus} score={incident.verificationScore} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {sources.length === 1 ? "Source" : `${sources.length} sources`}: {sources.slice(0, 3).join(", ")}
        {sources.length > 3 ? "…" : ""}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">
        Current status: <span className="text-foreground/80">unknown</span>. Deckwatch doesn&apos;t track
        whether an incident has cleared.
      </p>
      <button
        onClick={() => focus({ kind: "incident", value: incident.id })}
        className="mt-2 text-[11px] font-medium text-brand hover:underline"
      >
        View incident details
      </button>
      <span className="sr-only">{formatKm(match.offRouteKm)} from the route</span>
    </article>
  );
}
