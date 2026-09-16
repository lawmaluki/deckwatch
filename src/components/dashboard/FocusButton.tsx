"use client";

import { ArrowUpRight } from "lucide-react";
import { useMapFocus, type FocusAction } from "@/hooks/useMapFocus";

/** Small "take me to the map, scoped to this" affordance for panels whose body
 * can't be the click target — the heat map swallows clicks into Leaflet, and a
 * chart's own marks mean something different when clicked. */
export function FocusButton({
  action,
  children,
}: {
  action: FocusAction;
  children: React.ReactNode;
}) {
  const focus = useMapFocus();

  return (
    <button
      type="button"
      onClick={() => focus(action)}
      className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted transition-colors hover:text-brand"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </button>
  );
}
