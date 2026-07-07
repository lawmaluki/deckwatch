import { create } from "zustand";

interface UiState {
  notificationsOpen: boolean;
  setNotificationsOpen: (v: boolean) => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  intelFeedOpen: boolean;
  setIntelFeedOpen: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  notificationsOpen: false,
  setNotificationsOpen: (v) => set({ notificationsOpen: v }),
  filtersOpen: false,
  setFiltersOpen: (v) => set({ filtersOpen: v }),
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  intelFeedOpen: false,
  setIntelFeedOpen: (v) => set({ intelFeedOpen: v }),
}));
