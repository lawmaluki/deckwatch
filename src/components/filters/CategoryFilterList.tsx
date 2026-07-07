"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, Tags } from "lucide-react";
import { CATEGORY_LIST } from "@/lib/data/categories";
import { useAppStore } from "@/store/useAppStore";
import { useFilteredIncidents } from "@/hooks/useFilteredIncidents";
import { categoryBreakdown } from "@/lib/stats";

export function CategoryFilterList() {
  const [open, setOpen] = useState(false);
  const activeCategories = useAppStore((s) => s.activeCategories);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const facetIncidents = useFilteredIncidents({ ignoreCategoryFilter: true });
  const counts = new Map(categoryBreakdown(facetIncidents).map((c) => [c.category, c.count]));

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-panel flex h-9 w-48 items-center justify-between rounded-full px-3 text-xs font-medium sm:hidden"
      >
        <span className="flex items-center gap-1.5">
          <Tags className="h-3.5 w-3.5" />
          Types
          {activeCategories.length > 0 && (
            <span className="text-brand">({activeCategories.length})</span>
          )}
        </span>
        <ChevronDown className={clsx("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} />
      </button>

      <div
        className={clsx(
          "glass-panel w-48 rounded-xl p-3",
          open ? "block" : "hidden sm:block"
        )}
      >
        <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span>Types</span>
          <span>{facetIncidents.length}</span>
        </div>
        <div className="max-h-[32vh] space-y-0.5 overflow-y-auto pr-0.5 sm:max-h-[46vh]">
          {CATEGORY_LIST.map((cat) => {
            const active = activeCategories.includes(cat.id);
            const count = counts.get(cat.id) ?? 0;
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs font-medium transition-colors",
                  active
                    ? "bg-surface-raised text-foreground"
                    : "text-foreground/80 hover:bg-surface-raised/60"
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="flex-1 truncate">{cat.shortLabel}</span>
                <span className="text-muted">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
