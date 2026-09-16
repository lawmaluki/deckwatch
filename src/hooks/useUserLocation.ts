"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/** Keeps the in-memory position in step with the persisted intent to use it.
 *
 * Runs on every load rather than only on the click that enabled it: the flag
 * survives a reload but the coordinates deliberately don't, so without this a
 * returning reader's radius would silently match nothing. Where permission was
 * already granted the browser answers without prompting again. */
export function useUserLocation(): void {
  const useLocation = useAppStore((s) => s.notifications.useLocation);
  const setUserLocation = useAppStore((s) => s.setUserLocation);

  useEffect(() => {
    if (!useLocation) {
      setUserLocation(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Denied, unavailable, or timed out. The subscription stays on so the
        // panel can say so; county matching is unaffected either way.
        if (!cancelled) setUserLocation(null);
      },
      { maximumAge: 5 * 60_000, timeout: 10_000 }
    );

    return () => {
      cancelled = true;
    };
  }, [useLocation, setUserLocation]);
}
