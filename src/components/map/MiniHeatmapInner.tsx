"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import type { Incident } from "@/lib/types";
import { CountyBoundaries } from "@/components/map/CountyBoundaries";
import { HeatmapLayer } from "@/components/map/HeatmapLayer";

const KENYA_CENTER: [number, number] = [0.4, 37.9];

export default function MiniHeatmapInner({
  incidents,
  center = KENYA_CENTER,
  zoom = 5.4,
  minZoom = 5,
  maxZoom = 10,
}: {
  incidents: Incident[];
  center?: [number, number];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={minZoom}
      maxZoom={maxZoom}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging={true}
      className="h-full w-full rounded-xl"
      preferCanvas
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png" />
      <CountyBoundaries />
      <HeatmapLayer incidents={incidents} />
    </MapContainer>
  );
}
