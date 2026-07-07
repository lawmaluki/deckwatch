"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import type { Incident } from "@/lib/types";

const SEVERITY_INTENSITY: Record<Incident["severity"], number> = {
  low: 0.35,
  medium: 0.55,
  high: 0.8,
  critical: 1,
};

export function HeatmapLayer({ incidents }: { incidents: Incident[] }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number, number][] = incidents.map((i) => [
      i.lat,
      i.lng,
      SEVERITY_INTENSITY[i.severity],
    ]);

    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 12,
      gradient: { 0.2: "#22c55e", 0.4: "#eab308", 0.65: "#f97316", 1: "#ef4444" },
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, incidents]);

  return null;
}
