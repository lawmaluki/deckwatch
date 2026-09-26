"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Bell, MapPin, Radio, Crosshair, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useDismissible } from "@/hooks/useDismissible";
import { useUiStore } from "@/store/useUiStore";
import { useAppStore } from "@/store/useAppStore";
import { useAlertStore } from "@/store/useAlertStore";
import { useIncidents } from "@/hooks/useIncidents";
import { matchesSubscription } from "@/lib/alerts";
import { COUNTIES } from "@/lib/data/counties";
import { CATEGORY_LIST } from "@/lib/data/categories";
import type { Category } from "@/lib/types";

type PermissionState = NotificationPermission | "unsupported";

export function NotificationsModal() {
  const open = useUiStore((s) => s.notificationsOpen);
  const setOpen = useUiStore((s) => s.setNotificationsOpen);
  const notifications = useAppStore((s) => s.notifications);
  const updateNotifications = useAppStore((s) => s.updateNotifications);
  const resetNotifications = useAppStore((s) => s.resetNotifications);
  const userLocation = useAppStore((s) => s.userLocation);
  const raise = useAlertStore((s) => s.raise);
  const { incidents } = useIncidents();

  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [requested, setRequested] = useState<NotificationPermission | null>(null);

  // Read through on each render rather than cached in state, so a permission
  // revoked from the browser's own UI is reflected without a reload. `requested`
  // only carries the answer to a prompt this panel raised.
  const permission: PermissionState =
    requested ??
    (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

  function close() {
    setTestMessage(null);
    setOpen(false);
  }

  // Focus moves into the dialog on open, is held there while it is up, and
  // returns to the bell that opened it on close.
  const dialogRef = useDismissible<HTMLDivElement>(open, close);

  async function requestOsPermission() {
    if (typeof Notification === "undefined") return;
    setRequested(await Notification.requestPermission());
  }

  function sendTestAlert() {
    const match = incidents.find((i) =>
      matchesSubscription(i, notifications, userLocation)
    );
    if (!match) {
      setTestMessage("Nothing on record matches these filters yet.");
      return;
    }
    raise([match]);
    // The panel sits above the toasts, so step out of the way to show one.
    close();
  }

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
            onClick={close}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-subscriptions-title"
            className="glass-panel fixed inset-x-0 bottom-0 z-[2001] max-h-[85vh] overflow-y-auto rounded-t-2xl p-5 sm:inset-x-auto sm:right-6 sm:top-16 sm:bottom-auto sm:w-[420px] sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand" />
                <h2 id="alert-subscriptions-title" className="text-sm font-semibold">Alert Subscriptions</h2>
              </div>
              <button onClick={close} aria-label="Close alert subscriptions" className="text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-xs text-muted">
              Alerts fire while Deckwatch is open, as incidents arrive — within a
              minute of ingestion. Leave a section empty to match everything in it.
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Radio className="h-3.5 w-3.5" /> Radius around me:{" "}
                  {notifications.radiusKm} km
                </h3>
                <button
                  onClick={() =>
                    updateNotifications({ useLocation: !notifications.useLocation })
                  }
                  className={clsx(
                    "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    notifications.useLocation
                      ? "border-brand/60 bg-brand/10 text-brand"
                      : "border-border text-muted hover:text-foreground"
                  )}
                >
                  <Crosshair className="h-3 w-3" />
                  {notifications.useLocation ? "ON" : "USE LOCATION"}
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={notifications.radiusKm}
                disabled={!notifications.useLocation}
                onChange={(e) => updateNotifications({ radiusKm: Number(e.target.value) })}
                className="w-full accent-brand disabled:opacity-40"
              />
              <p className="mt-1 text-[10px] text-muted">
                {!notifications.useLocation
                  ? "Off — alerts match on county and category only."
                  : userLocation
                  ? "Using your location. Anything within the radius alerts, whichever county it falls in."
                  : "Waiting on location permission — county matching still applies."}
              </p>
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

            {notifications.channels.push && permission !== "granted" && (
              <button
                onClick={requestOsPermission}
                disabled={permission === "denied" || permission === "unsupported"}
                className="mb-3 w-full rounded-lg border border-brand/50 bg-brand/10 py-2 text-[11px] font-medium text-brand disabled:border-border disabled:bg-transparent disabled:text-muted"
              >
                {permission === "denied"
                  ? "Desktop notifications blocked — re-allow them in browser settings"
                  : permission === "unsupported"
                  ? "This browser has no desktop notifications; in-app alerts still work"
                  : "Allow desktop notifications for alerts while this tab is in the background"}
              </button>
            )}

            {testMessage && (
              <p className="mb-2 text-center text-[11px] text-muted">{testMessage}</p>
            )}

            <button
              onClick={() => {
                resetNotifications();
                setTestMessage(null);
              }}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Reset alerts
            </button>

            <div className="flex gap-2">
              <button
                onClick={sendTestAlert}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Test alert
              </button>
              {/* Every control here writes straight to the subscription, so
                  there is nothing left to save — the button only closes. */}
              <button
                onClick={close}
                className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
