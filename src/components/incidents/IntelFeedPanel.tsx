"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Radio, X } from "lucide-react";
import clsx from "clsx";
import { useDismissible } from "@/hooks/useDismissible";
import { useUiStore } from "@/store/useUiStore";
import { useAppStore } from "@/store/useAppStore";
import { useIncidents } from "@/hooks/useIncidents";
import { COUNTIES } from "@/lib/data/counties";
import { CATEGORIES, VERIFICATION_CONFIG } from "@/lib/data/categories";
import { hoursAgo } from "@/lib/stats";
import { relativeTime } from "@/lib/format";

const RANGE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "24H", hours: 24 },
  { label: "48H", hours: 48 },
  { label: "7D", hours: 168 },
  { label: "14D", hours: 336 },
  { label: "ALL", hours: null },
];

export function IntelFeedPanel() {
  const open = useUiStore((s) => s.intelFeedOpen);
  const setOpen = useUiStore((s) => s.setIntelFeedOpen);
  // Escape closes it, but focus is not trapped: the feed sits alongside the
  // map rather than over it, and holding focus captive would stop a reader
  // tabbing to the map it is meant to be read against.
  const panelRef = useDismissible<HTMLDivElement>(open, () => setOpen(false), {
    trapFocus: false,
  });
  const selectIncident = useAppStore((s) => s.selectIncident);
  const selectedId = useAppStore((s) => s.selectedIncidentId);
  const router = useRouter();
  const pathname = usePathname();

  const [rangeHours, setRangeHours] = useState<number | null>(24);
  const [county, setCounty] = useState<string>("all");
  const { incidents } = useIncidents();

  const rangeIncidents = useMemo(
    () =>
      rangeHours === null
        ? incidents
        : incidents.filter((i) => hoursAgo(i) <= rangeHours),
    [rangeHours, incidents]
  );

  const countyIncidents = useMemo(
    () => (county === "all" ? rangeIncidents : rangeIncidents.filter((i) => i.county === county)),
    [rangeIncidents, county]
  );

  const shown = countyIncidents;

  function openIncident(id: string) {
    selectIncident(id);
    // Only wide viewports show the two panels side by side. Below that the
    // feed is full-bleed and the detail panel lands on top of it, so keeping
    // it open would bury the map under two stacked sheets.
    if (!window.matchMedia("(min-width: 1024px)").matches) setOpen(false);
    if (pathname !== "/") router.push("/");
  }

  return (
    <>
      {open && (
        <>
          {/* No backdrop: the feed is a working surface alongside the map, not
              a modal over it, so panning and marker clicks stay live while it
              is open. Closing is the X button only. */}
          <div
            ref={panelRef}
            role="region"
            aria-label="Intel feed"
            data-map-occluder
            className="glass-panel fixed inset-y-0 right-0 z-[1401] flex w-full max-w-sm flex-col border-l border-border font-sans sm:top-14"
          >
            <div className="shrink-0 border-b border-border p-4">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold tracking-wide text-foreground">INTEL FEED</h2>
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-brand">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                    LIVE
                  </span>
                </div>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 text-[11px] text-muted">
                {shown.length} / {rangeIncidents.length} EVENTS
              </p>

              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setRangeHours(opt.hours)}
                      className={clsx(
                        "rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors",
                        rangeHours === opt.hours
                          ? "border-brand/60 bg-brand/10 text-brand"
                          : "border-border text-muted hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="relative shrink-0">
                  <select
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    className="appearance-none rounded-md border border-border bg-surface py-1 pl-2 pr-6 font-sans text-[10px] font-semibold text-muted focus:outline-none"
                  >
                    <option value="all">ALL COUNTIES</option>
                    {COUNTIES.map((c) => (
                      <option key={c.slug} value={c.name}>
                        {c.name.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                </div>
              </div>

            </div>

            <div className="flex-1 overflow-y-auto">
              {shown.length === 0 && (
                <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted">
                  <Radio className="h-4 w-4" /> No events in this window
                </div>
              )}
              {shown.map((incident) => {
                const cat = CATEGORIES[incident.category];
                const verification = VERIFICATION_CONFIG[incident.verificationStatus];
                const active = incident.id === selectedId;
                return (
                  <button
                    key={incident.id}
                    onClick={() => openIncident(incident.id)}
                    className={clsx(
                      "block w-full border-b border-l-2 border-border px-4 py-3 text-left transition-colors",
                      active
                        ? "bg-surface-raised"
                        : "border-l-transparent hover:bg-surface-raised"
                    )}
                    style={active ? { borderLeftColor: cat.color } : undefined}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: cat.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.label}
                        {incident.isLive && (
                          <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] text-brand">
                            LIVE
                          </span>
                        )}
                      </span>
                      <span suppressHydrationWarning className="shrink-0 text-[10px] text-muted">
                        {relativeTime(incident.reportedAt)}
                      </span>
                    </div>
                    <p className="mb-1 text-[11px] text-muted">{incident.county}</p>
                    <p className="mb-2 line-clamp-2 text-xs text-foreground/90">{incident.title}</p>
                    <div className="flex items-center gap-3 text-[10px] font-semibold">
                      <span style={{ color: verification.color }}>
                        {verification.label.toUpperCase()}
                      </span>
                      <span className="text-muted">CONF {incident.verificationScore}%</span>
                      <span className="text-muted">SRC {incident.sources.length}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
