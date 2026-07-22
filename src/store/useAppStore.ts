import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category, Severity, VerificationStatus } from "@/lib/types";

export type TimelineRange = 24 | 168 | 720;

interface NotificationSubscription {
  counties: string[];
  categories: Category[];
  radiusKm: number;
  channels: { push: boolean; sms: boolean; email: boolean };
}

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

      liveOnly: false,
      toggleLiveOnly: () => set((s) => ({ liveOnly: !s.liveOnly })),

      notifications: {
        counties: [],
        categories: [],
        radiusKm: 10,
        channels: { push: true, sms: false, email: false },
      },
      updateNotifications: (partial) =>
        set((s) => ({ notifications: { ...s.notifications, ...partial } })),
    }),
    {
      name: "deckwatch-kenya-preferences",
      partialize: (s) => ({ notifications: s.notifications }),
    }
  )
);
