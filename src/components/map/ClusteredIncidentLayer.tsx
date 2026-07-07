"use client";

import { useMemo, useState } from "react";
import { Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import Supercluster from "supercluster";
import type { Incident, Severity } from "@/lib/types";
import { CATEGORIES, SEVERITY_CONFIG } from "@/lib/data/categories";
import { clusterDivIcon, incidentDivIcon } from "@/components/map/markerIcons";
import { useAppStore } from "@/store/useAppStore";

interface ClusterProps {
  incidentId: string;
  severity: Severity;
}

interface AggProps {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

function dominantSeverityColor(severityCounts: Record<Severity, number>): string {
  const order: Severity[] = ["critical", "high", "medium", "low"];
  for (const sev of order) {
    if (severityCounts[sev] > 0) return SEVERITY_CONFIG[sev].color;
  }
  return SEVERITY_CONFIG.low.color;
}

export function ClusteredIncidentLayer({ incidents }: { incidents: Incident[] }) {
  const map = useMap();
  const selectIncident = useAppStore((s) => s.selectIncident);
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvents({
    moveend: () => {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
    zoomend: () => {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
  });

  const index = useMemo(() => {
    const sc = new Supercluster<ClusterProps, AggProps>({
      radius: 55,
      maxZoom: 15,
      map: (props) => ({
        low: props.severity === "low" ? 1 : 0,
        medium: props.severity === "medium" ? 1 : 0,
        high: props.severity === "high" ? 1 : 0,
        critical: props.severity === "critical" ? 1 : 0,
      }),
      reduce: (acc, props) => {
        acc.low += props.low;
        acc.medium += props.medium;
        acc.high += props.high;
        acc.critical += props.critical;
      },
    });
    sc.load(
      incidents.map((incident) => ({
        type: "Feature",
        properties: { incidentId: incident.id, severity: incident.severity },
        geometry: { type: "Point", coordinates: [incident.lng, incident.lat] },
      }))
    );
    return sc;
  }, [incidents]);

  const incidentById = useMemo(() => {
    const m = new Map<string, Incident>();
    incidents.forEach((i) => m.set(i.id, i));
    return m;
  }, [incidents]);

  const clusters = useMemo(() => {
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    return index.getClusters(bbox, Math.round(zoom));
  }, [index, bounds, zoom]);

  return (
    <>
      {clusters.map((cluster) => {
        const [lng, lat] = cluster.geometry.coordinates;
        if ("cluster" in cluster.properties) {
          const props = cluster.properties;
          const color = dominantSeverityColor(props);
          return (
            <Marker
              key={`cluster-${props.cluster_id}`}
              position={[lat, lng]}
              icon={clusterDivIcon(props.point_count, color)}
              eventHandlers={{
                click: () => {
                  const expansionZoom = Math.min(
                    index.getClusterExpansionZoom(props.cluster_id),
                    17
                  );
                  map.flyTo([lat, lng], expansionZoom, { duration: 0.5 });
                },
              }}
            />
          );
        }

        const incidentId = (cluster.properties as ClusterProps).incidentId;
        const incident = incidentById.get(incidentId);
        if (!incident) return null;
        const category = CATEGORIES[incident.category];

        return (
          <Marker
            key={incident.id}
            position={[lat, lng]}
            icon={incidentDivIcon(incident.severity)}
            eventHandlers={{ click: () => selectIncident(incident.id) }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1} className="incident-tooltip">
              <p className="text-xs font-bold leading-snug" style={{ color: category.color }}>
                {category.label}
              </p>
              <p className="text-xs leading-snug text-white/90">{incident.title}</p>
              <p className="mt-1 text-[10px] leading-snug text-white/50">
                {incident.reportedAt.slice(0, 10)}
              </p>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
