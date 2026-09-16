"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import type { Category, Severity } from "@/lib/types";

/** What a dashboard element means when clicked. A plain data descriptor rather
 * than a handler, so server components can hand it to a client leaf without
 * having to become client components themselves. */
export type FocusAction =
  | { kind: "all" }
  | { kind: "category"; value: Category }
  | { kind: "severity"; value: Severity }
  | { kind: "county"; value: string }
  | { kind: "incident"; value: string }
  | { kind: "heatmap" };

/** Opens the live map scoped to whatever was clicked.
 *
 * Filters reset first: the dashboard states a figure for the whole country, so
 * landing on the map still carrying an unrelated filter from an earlier visit
 * would show a different number than the card that was clicked. */
export function useMapFocus(): (action: FocusAction) => void {
  const router = useRouter();
  const resetFilters = useAppStore((s) => s.resetFilters);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const toggleSeverity = useAppStore((s) => s.toggleSeverity);
  const setCountyFilter = useAppStore((s) => s.setCountyFilter);
  const selectIncident = useAppStore((s) => s.selectIncident);
  const toggleHeatmap = useAppStore((s) => s.toggleHeatmap);

  return useCallback(
    (action: FocusAction) => {
      if (action.kind === "incident") {
        selectIncident(action.value);
        router.push("/");
        return;
      }

      resetFilters();
      selectIncident(null);

      switch (action.kind) {
        case "category":
          toggleCategory(action.value);
          break;
        case "severity":
          toggleSeverity(action.value);
          break;
        case "county":
          setCountyFilter(action.value);
          break;
        case "heatmap":
          // Read at call time, not render time: a stale capture would toggle
          // the heatmap back off for anyone who already had it on.
          if (!useAppStore.getState().showHeatmap) toggleHeatmap();
          break;
      }

      router.push("/");
    },
    [
      router,
      resetFilters,
      toggleCategory,
      toggleSeverity,
      setCountyFilter,
      selectIncident,
      toggleHeatmap,
    ]
  );
}
