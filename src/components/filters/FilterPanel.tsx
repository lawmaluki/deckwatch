"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, Flame, Radio, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "@/store/useAppStore";
import { SEVERITY_LIST } from "@/lib/data/categories";
import { VERIFICATION_CONFIG } from "@/lib/data/categories";
import type { VerificationStatus } from "@/lib/types";

const VERIFICATION_ORDER: VerificationStatus[] = [
  "verified",
  "likely_true",
  "unconfirmed",
  "false_report",
];

export function FilterPanel() {
  const [open, setOpen] = useState(false);
  const activeSeverities = useAppStore((s) => s.activeSeverities);
  const toggleSeverity = useAppStore((s) => s.toggleSeverity);
  const activeVerification = useAppStore((s) => s.activeVerification);
  const toggleVerification = useAppStore((s) => s.toggleVerification);
  const showHeatmap = useAppStore((s) => s.showHeatmap);
  const toggleHeatmap = useAppStore((s) => s.toggleHeatmap);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const toggleLiveOnly = useAppStore((s) => s.toggleLiveOnly);
  const resetFilters = useAppStore((s) => s.resetFilters);

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "glass-panel flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
          open ? "text-brand" : "text-foreground/90"
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[599] bg-black/60 sm:hidden"
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="glass-panel fixed inset-x-3 bottom-20 z-[600] max-h-[65vh] overflow-y-auto rounded-2xl p-4 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-11 sm:z-10 sm:w-64 sm:max-h-none sm:overflow-visible sm:rounded-xl sm:p-3"
            >
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-medium text-muted">Severity</p>
              <div className="flex flex-wrap gap-1.5">
                {SEVERITY_LIST.map((sev) => {
                  const id = sev.label.toLowerCase() as "low" | "medium" | "high" | "critical";
                  const active = activeSeverities.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleSeverity(id)}
                      className={clsx(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        active ? "border-transparent text-black" : "border-border text-muted"
                      )}
                      style={active ? { backgroundColor: sev.color } : undefined}
                    >
                      {sev.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-medium text-muted">Verification</p>
              <div className="flex flex-wrap gap-1.5">
                {VERIFICATION_ORDER.map((v) => {
                  const active = activeVerification.includes(v);
                  const config = VERIFICATION_CONFIG[v];
                  return (
                    <button
                      key={v}
                      onClick={() => toggleVerification(v)}
                      className={clsx(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        active ? "border-transparent text-black" : "border-border text-muted"
                      )}
                      style={active ? { backgroundColor: config.color } : undefined}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={toggleHeatmap}
              className={clsx(
                "mb-2 flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-medium",
                showHeatmap ? "border-brand/50 bg-brand/10 text-brand" : "border-border text-muted"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5" /> Heatmap view
              </span>
              <span>{showHeatmap ? "On" : "Off"}</span>
            </button>

            <button
              onClick={toggleLiveOnly}
              className={clsx(
                "mb-2 flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-medium",
                liveOnly ? "border-brand/50 bg-brand/10 text-brand" : "border-border text-muted"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" /> Live incidents only
              </span>
              <span>{liveOnly ? "On" : "Off"}</span>
            </button>

            <button
              onClick={resetFilters}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11px] text-muted hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Reset filters
            </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
