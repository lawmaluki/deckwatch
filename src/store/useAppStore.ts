import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category, Severity, VerificationStatus } from "@/lib/types";
import { USE_API } from "@/lib/incidents-source";

export type TimelineRange = 24 | 168 | 720;

export interface NotificationSubscription {
  counties: string[];
  categories: Category[];
  radiusKm: number;
  /** Whether radius matching is wanted. The coordinates themselves are held in
   * memory only (see userLocation) — an intent is worth remembering across
   * visits, a person's last known position is not. */
  useLocation: boolean;
  channels: { push: boolean; sms: boolean; email: boolean };
}

export interface Coords {
  lat: number;
  lng: number;
}

/** Named once so the initial state and the reset can't drift apart, and so a
 * subscription persisted before a field existed can be filled in from it. */
const DEFAULT_NOTIFICATIONS: NotificationSubscription = {
  counties: [],
  categories: [],
  radiusKm: 10,
  useLocation: false,
  channels: { push: true, sms: false, email: false },
};

interface AppState {
  activeCategories: Category[];
  activeSeverities: Severity[];
  activeVerification: VerificationStatus[];
  countyFilter: string | null;
  searchQuery: string;
  toggleCategory: (c: Category) => void;
  toggleSeverity: (s: Severity) => void;
  toggleVerification: (v: VerificationStatus) => void;
  setCountyFilter: (county: string | null) => void;
  setSearchQuery: (q: string) => void;
  resetFilters: () => void;

  selectedIncidentId: string | null;
  selectIncident: (id: string | null) => void;

  timelineMode: boolean;
  timelineRange: TimelineRange;
  timelineCursor: number;
  timelinePlaying: boolean;
  setTimelineMode: (on: boolean) => void;
  setTimelineRange: (r: TimelineRange) => void;
  setTimelineCursor: (v: number) => void;
  setTimelinePlaying: (v: boolean) => void;

  showHeatmap: boolean;
  toggleHeatmap: () => void;

  liveOnly: boolean;
  toggleLiveOnly: () => void;

  notifications: NotificationSubscription;
  updateNotifications: (partial: Partial<NotificationSubscription>) => void;
  resetNotifications: () => void;

  userLocation: Coords | null;
  setUserLocation: (coords: Coords | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeCategories: [],
      activeSeverities: [],
      activeVerification: [],
      countyFilter: null,
      searchQuery: "",
      toggleCategory: (c) =>
        set((s) => ({
          activeCategories: s.activeCategories.includes(c)
            ? s.activeCategories.filter((x) => x !== c)
            : [...s.activeCategories, c],
        })),
      toggleSeverity: (sev) =>
        set((s) => ({
          activeSeverities: s.activeSeverities.includes(sev)
            ? s.activeSeverities.filter((x) => x !== sev)
            : [...s.activeSeverities, sev],
        })),
      toggleVerification: (v) =>
        set((s) => ({
          activeVerification: s.activeVerification.includes(v)
            ? s.activeVerification.filter((x) => x !== v)
            : [...s.activeVerification, v],
        })),
      setCountyFilter: (county) => set({ countyFilter: county }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      resetFilters: () =>
        set({
          activeCategories: [],
          activeSeverities: [],
          activeVerification: [],
          countyFilter: null,
          searchQuery: "",
        }),

      selectedIncidentId: null,
      selectIncident: (id) => set({ selectedIncidentId: id }),

      timelineMode: false,
      timelineRange: 24,
      timelineCursor: 1,
      timelinePlaying: false,
      setTimelineMode: (on) =>
        set({ timelineMode: on, timelinePlaying: false, timelineCursor: 1 }),
      setTimelineRange: (r) => set({ timelineRange: r, timelineCursor: 1 }),
      setTimelineCursor: (v) => set({ timelineCursor: v }),
      setTimelinePlaying: (v) => set({ timelinePlaying: v }),

      showHeatmap: false,
      toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),

      // Hide the seed dataset by default once real data exists to see (api
      // mode); in local mock mode seed data is all there is, so show it.
      liveOnly: USE_API,
      toggleLiveOnly: () => set((s) => ({ liveOnly: !s.liveOnly })),

      notifications: DEFAULT_NOTIFICATIONS,
      updateNotifications: (partial) =>
        set((s) => ({ notifications: { ...s.notifications, ...partial } })),
      // useLocation returning to false lets the location effect drop the
      // coordinates, so there's nothing to clear here.
      resetNotifications: () => set({ notifications: DEFAULT_NOTIFICATIONS }),

      userLocation: null,
      setUserLocation: (coords) => set({ userLocation: coords }),
    }),
    {
      name: "deckwatch-kenya-preferences",
      partialize: (s) => ({ notifications: s.notifications }),
      // Persisted subscriptions predate later fields, and zustand replaces the
      // whole object rather than filling the gaps — so merge over the defaults
      // or a returning reader gets `undefined` where a flag should be.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...saved,
          notifications: { ...DEFAULT_NOTIFICATIONS, ...(saved.notifications ?? {}) },
        };
      },
    }
  )
);
