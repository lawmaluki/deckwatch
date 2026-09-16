"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useAlertStore, type Alert } from "@/store/useAlertStore";
import { useMapFocus } from "@/hooks/useMapFocus";
import { CATEGORIES } from "@/lib/data/categories";
import { relativeTime } from "@/lib/format";

const DISMISS_AFTER_MS = 12_000;

export function AlertToasts() {
  const alerts = useAlertStore((s) => s.alerts);

  return (
    <div
      // Above the panels but out of the way of the mobile nav. The wrapper
      // ignores pointer events so it never steals a click from the map
      // underneath when no alert is standing.
      className="pointer-events-none fixed inset-x-3 bottom-20 z-[1800] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:items-start"
    >
      <AnimatePresence initial={false}>
        {alerts.map((alert) => (
          <AlertToast key={alert.key} alert={alert} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function AlertToast({ alert }: { alert: Alert }) {
  const dismiss = useAlertStore((s) => s.dismiss);
  const focus = useMapFocus();
  const { incident } = alert;
  const category = CATEGORIES[incident.category];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(alert.key), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [alert.key, dismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", damping: 28, stiffness: 320 }}
      className="glass-panel pointer-events-auto w-full max-w-sm rounded-xl p-3 shadow-lg shadow-black/40"
      // No outline: depth comes from the shadow, and the category already
      // reads from the coloured label. Inline because .glass-panel is defined
      // after the utility layer and would otherwise win the border back.
      style={{ border: "none" }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"
          style={{ color: category.color }}
        >
          <Bell className="h-3 w-3 shrink-0" />
          <span className="truncate">{category.label}</span>
        </span>
        <button
          onClick={() => dismiss(alert.key)}
          aria-label="Dismiss alert"
          className="shrink-0 text-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        onClick={() => {
          focus({ kind: "incident", value: incident.id });
          dismiss(alert.key);
        }}
        className="block w-full text-left"
      >
        <p className="line-clamp-2 text-xs text-foreground/90">{incident.title}</p>
        <p suppressHydrationWarning className="mt-1 text-[10px] text-muted">
          {incident.county} County · {relativeTime(incident.reportedAt)} · View on map
        </p>
      </button>
    </motion.div>
  );
}
