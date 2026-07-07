"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, MapPin, Clock, Users, ImageOff, Sparkles, ShieldAlert } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { MOCK_INCIDENTS } from "@/lib/data/mock-incidents";
import { CATEGORIES } from "@/lib/data/categories";
import { CategoryBadge } from "@/components/incidents/CategoryBadge";
import { SeverityBadge } from "@/components/incidents/SeverityBadge";
import { VerificationBadge } from "@/components/incidents/VerificationBadge";
import { IncidentListItem } from "@/components/incidents/IncidentListItem";
import { formatDateTime, relativeTime } from "@/lib/format";
import { findSimilarIncidents } from "@/lib/geo";

const SOURCE_TYPE_LABEL: Record<string, string> = {
  news: "News",
  police: "Police",
  citizen: "Citizen",
  government: "Government",
  social: "Social",
};

export function IncidentDetailPanel() {
  const selectedId = useAppStore((s) => s.selectedIncidentId);
  const selectIncident = useAppStore((s) => s.selectIncident);
  const incident = MOCK_INCIDENTS.find((i) => i.id === selectedId) ?? null;
  const similar = incident ? findSimilarIncidents(incident, MOCK_INCIDENTS) : [];

  return (
    <AnimatePresence>
      {incident && (
        <motion.aside
          key={incident.id}
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 320 }}
          className="glass-panel absolute inset-x-0 bottom-0 z-[900] max-h-[70vh] overflow-y-auto rounded-t-2xl p-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-4 sm:max-h-none sm:w-[400px] sm:rounded-2xl sm:p-5"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={incident.category} />
              <SeverityBadge severity={incident.severity} />
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
            <p className="flex items-center gap-1.5">
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
            <p className="text-xs leading-relaxed text-foreground/85">{incident.aiSummary}</p>
          </section>

          {!incident.hasImage && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted">
              <ImageOff className="h-4 w-4" />
              No verified media attached to this report
            </div>
          )}

          <section className="mb-4">
            <p className="mb-2 text-xs font-medium text-muted">Sources</p>
            <ul className="space-y-1.5">
              {incident.sources.map((source, idx) => (
                <li
                  key={`${source.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5 text-xs"
                >
                  <span className="text-foreground/90">{source.name}</span>
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {SOURCE_TYPE_LABEL[source.type] ?? source.type}
                  </span>
                </li>
              ))}
            </ul>
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
