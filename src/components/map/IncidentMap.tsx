"use client";

import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Incident } from "@/lib/types";
import { CountyBoundaries } from "@/components/map/CountyBoundaries";
import { ClusteredIncidentLayer } from "@/components/map/ClusteredIncidentLayer";
import { HeatmapLayer } from "@/components/map/HeatmapLayer";
import { useAppStore } from "@/store/useAppStore";

const KENYA_CENTER: [number, number] = [0.4, 37.9];

function FlyToIncident({ incidents }: { incidents: Incident[] }) {
  const map = useMap();
  const selectedIncidentId = useAppStore((s) => s.selectedIncidentId);

  useEffect(() => {
    if (!selectedIncidentId) return;
    const incident = incidents.find((i) => i.id === selectedIncidentId);
    if (incident) {
      map.flyTo([incident.lat, incident.lng], Math.max(map.getZoom(), 11), {
        duration: 0.6,
      });
    }
  }, [selectedIncidentId, incidents, map]);

  return null;
}

export default function IncidentMap({ incidents }: { incidents: Incident[] }) {
  const showHeatmap = useAppStore((s) => s.showHeatmap);

  return (
    <MapContainer
      center={KENYA_CENTER}
      zoom={6.3}
      minZoom={5.5}
      maxZoom={17}
      zoomControl={false}
      className="h-full w-full"
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png"
      />
      <CountyBoundaries />
      {showHeatmap ? (
        <HeatmapLayer incidents={incidents} />
      ) : (
        <ClusteredIncidentLayer incidents={incidents} />
      )}
      <FlyToIncident incidents={incidents} />
    </MapContainer>
  );
}
