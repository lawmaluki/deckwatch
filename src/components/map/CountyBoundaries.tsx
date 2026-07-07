"use client";

import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { Layer, Path, PathOptions } from "leaflet";
import { useAppStore } from "@/store/useAppStore";
import { useRouter } from "next/navigation";
import { COUNTY_BY_NAME } from "@/lib/data/counties";

export function CountyBoundaries() {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const countyFilter = useAppStore((s) => s.countyFilter);
  const setCountyFilter = useAppStore((s) => s.setCountyFilter);
  const router = useRouter();

  useEffect(() => {
    fetch("/data/kenya-counties.geojson")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  const style = (feature?: Feature): PathOptions => {
    const name = feature?.properties?.name as string | undefined;
    const isActive = name && name === countyFilter;
    return {
      color: isActive ? "#22c55e" : "#2c3547",
      weight: isActive ? 2 : 0.8,
      fillColor: isActive ? "#22c55e" : "#000000",
      fillOpacity: isActive ? 0.08 : 0.02,
    };
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const name = feature.properties?.name as string | undefined;
    if (!name) return;
    layer.bindTooltip(name, { sticky: true, className: "!bg-surface-raised !text-foreground !border-border !text-xs" });
    layer.on({
      click: () => setCountyFilter(countyFilter === name ? null : name),
      dblclick: () => {
        const slug = COUNTY_BY_NAME[name]?.slug;
        if (slug) router.push(`/county/${slug}`);
      },
      mouseover: (e) => (e.target as Path).setStyle({ weight: 1.6, color: "#4b5568" }),
      mouseout: (e) => (e.target as Path).setStyle(style(feature)),
    });
  };

  return <GeoJSON data={data} style={style} onEachFeature={onEachFeature} />;
}
