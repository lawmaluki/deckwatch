"use client";

import { useEffect, useState } from "react";
import { GeoJSON, Pane } from "react-leaflet";
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

  // Canvas can't resolve CSS variables, so read the site theme directly — the
  // map then follows any change to the palette in globals.css.
  const theme = readTheme();

  // No basemap sits underneath. Counties are filled with the site background
  // so the map reads as outlines alone; the fill stays fully opaque because the
  // bold-country-border trick below depends on it masking what it covers.
  const style = (feature?: Feature): PathOptions => {
    const name = feature?.properties?.name as string | undefined;
    const isActive = name && name === countyFilter;
    return {
      color: isActive ? theme.brand : theme.border,
      weight: isActive ? 2 : 1,
      fillColor: isActive ? theme.brandFill : theme.background,
      fillOpacity: 1,
    };
  };

  // The data is 47 separate counties with no national outline. Stroking every
  // county thickly underneath, then painting the opaque county fills over it,
  // hides the inner half of every stroke — including all interior borders — so
  // only a bold line around the outside of Kenya remains.
  const outlineStyle: PathOptions = {
    color: theme.border,
    opacity: 1,
    weight: COUNTRY_BORDER_WEIGHT,
    fillOpacity: 0,
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
      mouseover: (e) => (e.target as Path).setStyle({ weight: 1.6, color: theme.muted }),
      mouseout: (e) => (e.target as Path).setStyle(style(feature)),
    });
  };

  // Own pane below the overlay pane (z 400): the county fills are opaque, and
  // this layer loads asynchronously, so sharing the overlay pane's canvas could
  // paint the counties over the heatmap depending on which finished first.
  return (
    <>
      <Pane name="country-outline" style={{ zIndex: 340 }}>
        <GeoJSON data={data} style={outlineStyle} interactive={false} />
      </Pane>
      <Pane name="county-boundaries" style={{ zIndex: 350 }}>
        <GeoJSON data={data} style={style} onEachFeature={onEachFeature} />
      </Pane>
    </>
  );
}

// Visible width is half of this (the other half sits under the county fills).
const COUNTRY_BORDER_WEIGHT = 5;

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function readTheme() {
  return {
    background: cssVar("--background", "#05070a"),
    border: cssVar("--border", "#1c2330"),
    muted: cssVar("--muted", "#8993a4"),
    brand: cssVar("--brand", "#22c55e"),
    // A dark green tint of the brand color for the selected county's fill.
    brandFill: "#12301f",
  };
}
