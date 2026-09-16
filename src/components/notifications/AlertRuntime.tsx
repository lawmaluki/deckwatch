"use client";

import { useAlertWatcher } from "@/hooks/useAlertWatcher";
import { useUserLocation } from "@/hooks/useUserLocation";
import { AlertToasts } from "@/components/notifications/AlertToasts";

/** Mounts alerting once for the whole app. Kept as its own leaf so the poll
 * behind it re-renders this subtree and not the shell around it. */
export function AlertRuntime() {
  useUserLocation();
  useAlertWatcher();
  return <AlertToasts />;
}
