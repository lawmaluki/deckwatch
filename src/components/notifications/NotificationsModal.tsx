"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Bell, MapPin, Radio } from "lucide-react";
import clsx from "clsx";
import { useUiStore } from "@/store/useUiStore";
import { useAppStore } from "@/store/useAppStore";
import { COUNTIES } from "@/lib/data/counties";
import { CATEGORY_LIST } from "@/lib/data/categories";
import type { Category } from "@/lib/types";

export function NotificationsModal() {
  const open = useUiStore((s) => s.notificationsOpen);
  const setOpen = useUiStore((s) => s.setNotificationsOpen);
  const notifications = useAppStore((s) => s.notifications);
  const updateNotifications = useAppStore((s) => s.updateNotifications);

  function toggleCounty(name: string) {
    const set = new Set(notifications.counties);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    updateNotifications({ counties: Array.from(set) });
  }

  function toggleCategory(cat: Category) {
    const set = new Set(notifications.categories);
    if (set.has(cat)) set.delete(cat);
    else set.add(cat);
    updateNotifications({ categories: Array.from(set) });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[2000] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="glass-panel fixed inset-x-0 bottom-0 z-[2001] max-h-[85vh] overflow-y-auto rounded-t-2xl p-5 sm:inset-x-auto sm:right-6 sm:top-16 sm:bottom-auto sm:w-[420px] sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold">Alert Subscriptions</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-xs text-muted">
              Get notified about incidents in counties and categories you care about.
            </p>

            <section className="mb-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <MapPin className="h-3.5 w-3.5" /> Counties
              </h3>
              <div className="grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2">
                {COUNTIES.map((c) => (
                  <label key={c.slug} className="flex items-center gap-1.5 text-xs text-foreground/90">
                    <input
                      type="checkbox"
                      checked={notifications.counties.includes(c.name)}
                      onChange={() => toggleCounty(c.name)}
                      className="h-3 w-3 accent-brand"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </section>

            <section className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-muted">Categories</h3>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_LIST.map((cat) => {
                  const active = notifications.categories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      className={clsx(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        active
                          ? "border-transparent text-black"
                          : "border-border text-muted hover:text-foreground"
                      )}
                      style={active ? { backgroundColor: cat.color } : undefined}
                    >
                      {cat.shortLabel}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mb-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Radio className="h-3.5 w-3.5" /> Radius around me: {notifications.radiusKm} km
              </h3>
              <input
                type="range"
                min={1}
                max={50}
                value={notifications.radiusKm}
                onChange={(e) => updateNotifications({ radiusKm: Number(e.target.value) })}
                className="w-full accent-brand"
              />
            </section>

            <section className="mb-5 grid grid-cols-3 gap-2">
              {(["push", "sms", "email"] as const).map((channel) => (
                <label
                  key={channel}
                  className={clsx(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium capitalize",
                    notifications.channels[channel]
                      ? "border-brand/60 bg-brand/10 text-brand"
                      : "border-border text-muted"
                  )}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={notifications.channels[channel]}
                    onChange={() =>
                      updateNotifications({
                        channels: { ...notifications.channels, [channel]: !notifications.channels[channel] },
                      })
                    }
                  />
                  {channel}
                </label>
              ))}
            </section>

            <button
              onClick={() => setOpen(false)}
              className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              Save preferences
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
