"use client";

import dynamic from "next/dynamic";
import type { Incident } from "@/lib/types";

const IncidentMap = dynamic(() => import("@/components/map/IncidentMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
        <p className="text-xs">Loading live map…</p>
      </div>
    </div>
  ),
});

export function MapView({ incidents }: { incidents: Incident[] }) {
  return <IncidentMap incidents={incidents} />;
}
