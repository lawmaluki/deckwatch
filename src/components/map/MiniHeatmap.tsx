"use client";

import dynamic from "next/dynamic";
import type { Incident } from "@/lib/types";

const MiniHeatmapInner = dynamic(() => import("@/components/map/MiniHeatmapInner"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-surface" />,
});

export function MiniHeatmap({
  incidents,
  center,
  zoom,
  minZoom,
  maxZoom,
}: {
  incidents: Incident[];
  center?: [number, number];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
}) {
  return (
    <MiniHeatmapInner
      incidents={incidents}
      center={center}
      zoom={zoom}
      minZoom={minZoom}
      maxZoom={maxZoom}
    />
  );
}
