"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useIncidents } from "@/hooks/useIncidents";
import { parseSearchQuery } from "@/lib/search";
import { filterIncidents } from "@/lib/incident-filter";
import { MS_PER_HOUR } from "@/lib/constants";
import type { Incident } from "@/lib/types";

export function useFilteredIncidents(opts?: { ignoreCategoryFilter?: boolean }): Incident[] {
  const ignoreCategoryFilter = opts?.ignoreCategoryFilter ?? false;
  const activeCategories = useAppStore((s) => s.activeCategories);
  const activeSeverities = useAppStore((s) => s.activeSeverities);
  const activeVerification = useAppStore((s) => s.activeVerification);
  const countyFilter = useAppStore((s) => s.countyFilter);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const timelineMode = useAppStore((s) => s.timelineMode);
  const timelineRange = useAppStore((s) => s.timelineRange);
  const timelineCursor = useAppStore((s) => s.timelineCursor);
  const { incidents, referenceTime } = useIncidents();

  return useMemo(() => {
    const parsed = searchQuery.trim() ? parseSearchQuery(searchQuery) : null;
    const categories = ignoreCategoryFilter
      ? []
      : activeCategories.length
      ? activeCategories
      : parsed?.categories ?? [];
    // Free text only applies when the query parsed to nothing structured;
    // otherwise the parsed county/categories/hours already carry the intent.
    const parsedToStructured =
      !!parsed && (!!parsed.county || parsed.categories.length > 0 || !!parsed.hours);
    const timeWindow = timelineMode
      ? {
          start: referenceTime.getTime() - timelineRange * MS_PER_HOUR,
          end:
            referenceTime.getTime() -
            timelineRange * MS_PER_HOUR * (1 - timelineCursor),
        }
      : null;

    return filterIncidents(incidents, {
      categories,
      severities: activeSeverities,
      verification: activeVerification,
      county: countyFilter ?? parsed?.county ?? null,
      withinHours: parsed?.hours ?? null,
      freeText: parsed && !parsedToStructured ? parsed.freeText : "",
      timeWindow,
    });
  }, [
    ignoreCategoryFilter,
    activeCategories,
    activeSeverities,
    activeVerification,
    countyFilter,
    searchQuery,
    timelineMode,
    timelineRange,
    timelineCursor,
    incidents,
    referenceTime,
  ]);
}
