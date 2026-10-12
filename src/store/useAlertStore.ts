import { create } from "zustand";
import type { Incident } from "@/lib/types";

/** How many toasts can stand at once. A quiet night can be followed by a poll
 * carrying a dozen matching incidents, and a column of twelve is noise rather
 * than an alert — the rest stay in the feed where they can be read in order. */
const MAX_VISIBLE = 3;

export interface Alert {
  /** Distinct from the incident id: the same incident re-alerted by a test
   * shouldn't collide with, or dismiss, the one already on screen. */
  key: string;
  incident: Incident;
  /** Why this reader is hearing about it, when it is more specific than the
   * subscription: "On Nairobi CBD → Thika, 12 km in". */
  context?: string;
}

interface AlertState {
  alerts: Alert[];
  raise: (incidents: Incident[], context?: (incident: Incident) => string | undefined) => void;
  dismiss: (key: string) => void;
  clear: () => void;
}

let counter = 0;

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  raise: (incidents, context) =>
    set((s) => ({
      alerts: [
        ...s.alerts,
        ...incidents.map((incident) => ({
          key: `${incident.id}:${counter++}`,
          incident,
          context: context?.(incident),
        })),
      ].slice(-MAX_VISIBLE),
    })),
  dismiss: (key) => set((s) => ({ alerts: s.alerts.filter((a) => a.key !== key) })),
  clear: () => set({ alerts: [] }),
}));
