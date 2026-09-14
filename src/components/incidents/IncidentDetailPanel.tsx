"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  MapPin,
  Clock,
  Users,
  ImageOff,
  Sparkles,
  ShieldAlert,
  ExternalLink,
  Radio,
} from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "@/store/useAppStore";
import { useUiStore } from "@/store/useUiStore";
import { useIncidents } from "@/hooks/useIncidents";
import { CATEGORIES } from "@/lib/data/categories";
import { CategoryBadge } from "@/components/incidents/CategoryBadge";
import { SeverityBadge } from "@/components/incidents/SeverityBadge";
import { VerificationBadge } from "@/components/incidents/VerificationBadge";
import { IncidentListItem } from "@/components/incidents/IncidentListItem";
import { formatDateTime, relativeTime, stripHtml } from "@/lib/format";
import { findSimilarIncidents } from "@/lib/geo";

const SOURCE_TYPE_LABEL: Record<string, string> = {
  news: "News",
  police: "Police",
  citizen: "Citizen",
  government: "Government",
  social: "Social",
};

// Seeded incidents routinely carry four to eight sources, which let the list
// run longer than everything above it combined. Three is enough to show the
// corroboration is real; the rest stay one tap away.
const SOURCES_SHOWN = 3;

export function IncidentDetailPanel() {
  const selectedId = useAppStore((s) => s.selectedIncidentId);
  const selectIncident = useAppStore((s) => s.selectIncident);
  const intelFeedOpen = useUiStore((s) => s.intelFeedOpen);
  const { incidents } = useIncidents();
  const incident = incidents.find((i) => i.id === selectedId) ?? null;
  const similar = incident ? findSimilarIncidents(incident, incidents) : [];
  // Keyed by incident rather than a bare boolean: the panel doesn't remount
  // between incidents, so a boolean would leave the next one pre-expanded.
  const [sourcesExpandedFor, setSourcesExpandedFor] = useState<string | null>(null);

  const sourcesExpanded = !!incident && sourcesExpandedFor === incident.id;
  const visibleSources = incident
    ? sourcesExpanded
      ? incident.sources
      : incident.sources.slice(0, SOURCES_SHOWN)
    : [];
  const hiddenSourceCount = incident
    ? incident.sources.length - visibleSources.length
    : 0;

  return (
    <AnimatePresence>
      {incident && (
        <motion.aside
          key={incident.id}
          data-map-occluder
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 320 }}
          className={clsx(
            // bottom-16 clears the mobile nav, which is only hidden from md —
            // anchoring to the viewport bottom buries the panel's last rows
            // behind it.
            "glass-panel absolute inset-x-0 bottom-16 max-h-[70vh] overflow-y-auto rounded-t-2xl p-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-[400px] sm:rounded-2xl sm:p-5 md:bottom-4",
            // With the feed open, clear its 24rem drawer so the two read as
            // one side-by-side surface — but only from lg up: below that the
            // widths can't both fit, so this stacks over the feed instead
            // (hence sitting above its z-index).
            intelFeedOpen ? "z-[1402] lg:right-[25rem]" : "z-[900]"
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={incident.category} />
              <SeverityBadge severity={incident.severity} />
              {incident.isLive && (
                <span className="flex items-center gap-1 rounded-full bg-brand/15 px-2 py-1 text-[11px] font-medium text-brand">
                  <Radio className="h-3 w-3" /> LIVE
                </span>
              )}
            </div>
            <button
              onClick={() => selectIncident(null)}
              className="shrink-0 rounded-md p-1 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h2 className="mb-2 text-base font-semibold leading-snug text-foreground">
            {incident.title}
          </h2>

          <div className="mb-3 space-y-1.5 text-xs text-muted">
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {incident.locationName} · {incident.county} County
            </p>
            <p suppressHydrationWarning className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatDateTime(incident.reportedAt)} ({relativeTime(incident.reportedAt)})
            </p>
            <p className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {incident.reportCount} report{incident.reportCount === 1 ? "" : "s"} merged by AI
              deduplication
            </p>
          </div>

          <div className="mb-4">
            <VerificationBadge status={incident.verificationStatus} score={incident.verificationScore} />
          </div>

          <section className="mb-4 rounded-xl border border-border bg-surface p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-brand">
              <Sparkles className="h-3.5 w-3.5" /> AI Summary
            </p>
            <p className="text-xs leading-relaxed text-foreground/85">
              {stripHtml(incident.aiSummary)}
            </p>
          </section>

          {/* Says only what we know: nothing is attached. It claimed "no
              verified media", which implied a media-verification step that
              does not exist — ingestion reads title, summary and link only. */}
          {!incident.hasImage && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted">
              <ImageOff className="h-4 w-4" />
              No photo or video attached to this report
            </div>
          )}

          <section className="mb-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-muted">Sources</p>
              <p className="text-[10px] tabular-nums text-muted/70">
                {incident.sources.length}
              </p>
            </div>

            <ul className="space-y-1.5">
              {visibleSources.map((source, idx) => {
                const label = SOURCE_TYPE_LABEL[source.type] ?? source.type;
                // The whole row is the target, not just the name: a two-word
                // outlet gave a tap area far too small on a phone.
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground/90">
                        {source.name}
                      </span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted">
                        {label}
                      </span>
                    </span>
                    {source.url && (
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted" />
                    )}
                  </>
                );

                return (
                  <li key={`${source.name}-${idx}`}>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-2 transition-colors hover:border-brand/40 hover:bg-surface-raised"
                      >
                        {body}
                      </a>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-2">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {(hiddenSourceCount > 0 || sourcesExpanded) && (
              <button
                onClick={() =>
                  setSourcesExpandedFor(sourcesExpanded ? null : incident.id)
                }
                className="mt-1.5 w-full rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-foreground"
              >
                {sourcesExpanded
                  ? "Show fewer"
                  : `Show ${hiddenSourceCount} more`}
              </button>
            )}
          </section>

          <section className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
              <ShieldAlert className="h-3.5 w-3.5" /> Recommended actions
            </p>
            <ul className="space-y-1.5">
              {incident.recommendedActions.map((action) => (
                <li key={action} className="flex gap-2 text-xs text-foreground/85">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  {action}
                </li>
              ))}
            </ul>
          </section>

          {similar.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-medium text-muted">Similar incidents nearby</p>
              <div className="space-y-1.5">
                {similar.map((s) => (
                  <IncidentListItem key={s.id} incident={s} onClick={() => selectIncident(s.id)} />
                ))}
              </div>
            </section>
          )}

          <p className="mt-4 text-center text-[10px] text-muted/70">
            Category: {CATEGORIES[incident.category].label}
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
