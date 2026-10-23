"use client";

import { MapView } from "@/components/map/MapView";
import { MapLegend } from "@/components/map/MapLegend";
import { TimelineControl, TimelineToggle } from "@/components/map/TimelineControl";
import { CategoryFilterList } from "@/components/filters/CategoryFilterList";
import { FilterPanel } from "@/components/filters/FilterPanel";
import { SearchBar } from "@/components/search/SearchBar";
import { IncidentDetailPanel } from "@/components/incidents/IncidentDetailPanel";
import { useFilteredIncidents } from "@/hooks/useFilteredIncidents";
import { useAppStore } from "@/store/useAppStore";

export function MapExperience() {
  const incidents = useFilteredIncidents();
  const countyFilter = useAppStore((s) => s.countyFilter);
  const setCountyFilter = useAppStore((s) => s.setCountyFilter);
  const todayMode = useAppStore((s) => s.todayMode);
  const setTodayMode = useAppStore((s) => s.setTodayMode);

  return (
    <div className="relative h-full w-full">
      <MapView incidents={incidents} />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-col items-stretch gap-2 sm:items-start">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <SearchBar />
          <div className="pointer-events-none flex flex-nowrap items-center gap-2 sm:justify-end">
            <TimelineToggle />
            <FilterPanel />
          </div>
        </div>

        {(todayMode || countyFilter) && (
          <div className="flex justify-start gap-2">
            {todayMode && (
              <button
                onClick={() => setTodayMode(false)}
                aria-label="Show all incidents again"
                className="glass-panel pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-brand"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                Today ✕
              </button>
            )}
            {countyFilter && (
            <button
              onClick={() => setCountyFilter(null)}
              className="glass-panel pointer-events-auto rounded-full px-3 py-1.5 text-xs font-medium text-brand"
            >
              {countyFilter} County ✕
            </button>
            )}
          </div>
        )}

        <div className="flex justify-start">
          <CategoryFilterList />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-16 left-3 z-[500] hidden sm:block md:bottom-4">
        <MapLegend />
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-16 z-[500] flex justify-center md:bottom-4">
        <TimelineControl />
      </div>

      <IncidentDetailPanel />
    </div>
  );
}
