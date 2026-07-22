"use client";

import { CATEGORIES } from "@/lib/data/categories";
import { SeverityDot } from "@/components/incidents/SeverityBadge";
import { relativeTime } from "@/lib/format";
import type { Incident } from "@/lib/types";
import clsx from "clsx";

export function IncidentListItem({
  incident,
  onClick,
  active,
}: {
  incident: Incident;
  onClick?: () => void;
  active?: boolean;
}) {
  const config = CATEGORIES[incident.category];
  const Icon = config.icon;
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-brand/50 bg-brand/10"
          : "border-transparent bg-surface hover:border-border hover:bg-surface-raised"
      )}
    >
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${config.color}22`, color: config.color }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <SeverityDot severity={incident.severity} />
          <p className="truncate text-sm font-medium text-foreground">{incident.title}</p>
          {incident.isLive && (
            <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-semibold text-brand">
              LIVE
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {incident.county} County · {relativeTime(incident.reportedAt)}
        </p>
      </div>
    </button>
  );
}
