"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { MOCK_INCIDENTS, DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";
import { parseSearchQuery } from "@/lib/search";
import { hoursAgo } from "@/lib/stats";
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

  return useMemo(() => {
    const parsed = searchQuery.trim() ? parseSearchQuery(searchQuery) : null;
    const categories = ignoreCategoryFilter
      ? []
      : activeCategories.length
      ? activeCategories
      : parsed?.categories ?? [];
    const county = countyFilter ?? parsed?.county ?? null;
    const searchHours = parsed?.hours ?? null;
    const freeText = parsed?.freeText.toLowerCase() ?? "";

    let result = MOCK_INCIDENTS.filter((incident) => {
      if (categories.length && !categories.includes(incident.category)) return false;
      if (activeSeverities.length && !activeSeverities.includes(incident.severity)) return false;
      if (activeVerification.length && !activeVerification.includes(incident.verificationStatus))
        return false;
      if (county && incident.county !== county) return false;
      if (searchHours && hoursAgo(incident) > searchHours) return false;
      if (freeText && !parsed?.county && !parsed?.categories.length && !parsed?.hours) {
        const haystack = `${incident.title} ${incident.locationName} ${incident.county}`.toLowerCase();
        if (!haystack.includes(freeText)) return false;
      }
      return true;
    });

    if (timelineMode) {
      const cutoff =
        DATA_REFERENCE_TIME.getTime() - timelineRange * 60 * 60 * 1000 * (1 - timelineCursor);
      const windowStart = DATA_REFERENCE_TIME.getTime() - timelineRange * 60 * 60 * 1000;
      result = result.filter((incident) => {
        const t = new Date(incident.reportedAt).getTime();
        return t >= windowStart && t <= cutoff;
      });
    }

    return result;
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
  ]);
}
