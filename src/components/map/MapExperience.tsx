"use client";

import { useEffect } from "react";
import { MapView } from "@/components/map/MapView";
import { MapLegend } from "@/components/map/MapLegend";
import { TimelineControl, TimelineToggle } from "@/components/map/TimelineControl";
import { CategoryFilterList } from "@/components/filters/CategoryFilterList";
import { FilterPanel } from "@/components/filters/FilterPanel";
import { SearchBar } from "@/components/search/SearchBar";
import { IncidentDetailPanel } from "@/components/incidents/IncidentDetailPanel";
import { useFilteredIncidents } from "@/hooks/useFilteredIncidents";
import { useAppStore } from "@/store/useAppStore";
import { useUiStore } from "@/store/useUiStore";
import type { Incident } from "@/lib/types";

/** `initialIncident` is set on a shared incident's page: the map opens on it. */
export function MapExperience({ initialIncident = null }: { initialIncident?: Incident | null } = {}) {
  const incidents = useFilteredIncidents();
  const countyFilter = useAppStore((s) => s.countyFilter);
  const setCountyFilter = useAppStore((s) => s.setCountyFilter);
  const todayMode = useAppStore((s) => s.todayMode);
  const setTodayMode = useAppStore((s) => s.setTodayMode);
  const intelFeedOpen = useUiStore((s) => s.intelFeedOpen);
  const setIntelFeedOpen = useUiStore((s) => s.setIntelFeedOpen);
  const selectIncident = useAppStore((s) => s.selectIncident);
  const initialId = initialIncident?.id ?? null;

  // Once per link opened, not on every render: after this the reader is free
  // to close the panel or move on to another incident.
  useEffect(() => {
    if (initialId) selectIncident(initialId);
  }, [initialId, selectIncident]);

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
          <div className="flex flex-wrap justify-start gap-2">
            {todayMode && (
              <button
                onClick={() => setTodayMode(false)}
                aria-label="Show all incidents again"
                className="glass-panel pointer-events-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-xs font-medium text-brand sm:h-auto sm:px-3 sm:py-1.5"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                Today ✕
              </button>
            )}
            {todayMode && !intelFeedOpen && (
              // The feed is closed on a phone (it would cover the map) or
              // when the reader shut it: one tap brings the list back.
              <button
                onClick={() => setIntelFeedOpen(true)}
                className="glass-panel pointer-events-auto flex h-10 items-center rounded-full px-4 text-xs font-medium text-foreground sm:h-auto sm:px-3 sm:py-1.5"
              >
                List ({incidents.length})
              </button>
            )}
            {countyFilter && (
            <button
              onClick={() => setCountyFilter(null)}
              className="glass-panel pointer-events-auto flex h-10 items-center rounded-full px-4 text-xs font-medium text-brand sm:h-auto sm:px-3 sm:py-1.5"
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

      <IncidentDetailPanel fallback={initialIncident} />
    </div>
  );
}
