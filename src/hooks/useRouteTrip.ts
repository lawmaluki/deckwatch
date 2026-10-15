"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAlertStore } from "@/store/useAlertStore";
import { useAppStore } from "@/store/useAppStore";
import { CATEGORIES } from "@/lib/data/categories";
import {
  formatKm,
  TRAVEL_MODES,
  tripAlerts,
  tripProgress,
  type PreparedRoute,
  type RouteMatch,
  type TravelMode,
  type TripProgress,
} from "@/lib/route-watch";

export interface RouteTrip {
  active: boolean;
  /** Last known position, kept in memory only and never sent anywhere. */
  position: { lat: number; lng: number; accuracyM: number } | null;
  progress: TripProgress | null;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/** A journey along a Route Watch route, followed while the page is open.
 *
 * Watches the device's position, works out which incidents are still ahead,
 * and warns — in-app, and as a desktop/phone notification where allowed —
 * when one is close ahead or a new one is reported further on. Keeps the
 * screen awake where the browser allows, since a sleeping phone stops
 * reporting position. Ends when the route changes or the page is left. */
export function useRouteTrip(
  route: PreparedRoute | null,
  routeKey: string | null,
  matches: RouteMatch[],
  mode: TravelMode
): RouteTrip {
  const [tripKey, setTripKey] = useState<string | null>(null);
  const [position, setPosition] = useState<RouteTrip["position"]>(null);
  const [error, setError] = useState<string | null>(null);
  const raise = useAlertStore((s) => s.raise);
  const pushOn = useAppStore((s) => s.notifications.channels.push);

  // A trip belongs to the route it started on: choosing another one ends it.
  const active = tripKey !== null && tripKey === routeKey;

  const warned = useRef<Set<string>>(new Set());
  const knownAtStart = useRef<Set<string> | null>(null);

  const start = useCallback(() => {
    if (!routeKey) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser can't share its location, so a trip can't follow you.");
      return;
    }
    warned.current = new Set();
    knownAtStart.current = null;
    setPosition(null);
    setError(null);
    setTripKey(routeKey);
  }, [routeKey]);

  const stop = useCallback(() => setTripKey(null), []);

  // Position.
  useEffect(() => {
    if (!active) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy });
      },
      (err) =>
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked for this site. Allow it in your browser to follow your trip."
            : "Can't get your location right now. Still trying…"
        ),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  // Screen wake lock, re-taken when the page comes back into view (browsers
  // release it whenever the page is hidden).
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release();
    };
  }, [active]);

  const progress = useMemo(
    () => (active && route && position ? tripProgress(route, matches, position.lat, position.lng) : null),
    [active, route, position, matches]
  );

  // Warnings.
  useEffect(() => {
    if (!progress) return;
    // What was on the route when the first fix arrived is "known"; anything
    // matching later was reported mid-trip.
    knownAtStart.current ??= new Set(matches.map((m) => m.incident.id));
    const due = tripAlerts(progress, TRAVEL_MODES[mode].approachKm, warned.current, knownAtStart.current);
    if (due.length === 0) return;
    for (const { match } of due) warned.current.add(match.incident.id);

    const context = new Map(
      due.map(({ match, reason }) => {
        const ahead = formatKm(Math.max(0, match.alongKm - progress.alongKm));
        return [match.incident.id, reason === "new" ? `New on your route, ${ahead} ahead` : `${ahead} ahead on your route`];
      })
    );
    raise(
      due.map((d) => d.match.incident),
      (i) => context.get(i.id)
    );
    if (pushOn && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const { match } of due) {
        try {
          new Notification(CATEGORIES[match.incident.category].label, {
            body: `${context.get(match.incident.id)}: ${match.incident.title}`,
            tag: `trip-${match.incident.id}`,
          });
        } catch {
          // Mobile browsers throw here without a service worker; the in-app
          // alert has already fired.
        }
      }
    }
  }, [progress, matches, mode, raise, pushOn]);

  return { active, position: active ? position : null, progress, error: active ? error : null, start, stop };
}
