import L from "leaflet";
import { SEVERITY_CONFIG } from "@/lib/data/categories";
import type { Severity } from "@/lib/types";

export function incidentDivIcon(severity: Severity): L.DivIcon {
  const color = SEVERITY_CONFIG[severity].color;
  const pulse = severity === "critical" || severity === "high";
  return L.divIcon({
    className: "incident-marker",
    html: `
      <div style="position:relative;width:16px;height:16px;">
        ${
          pulse
            ? `<span class="pulse-ring" style="position:absolute;inset:0;border-radius:9999px;background:${color};"></span>`
            : ""
        }
        <span style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid rgba(5,7,10,0.85);box-shadow:0 0 0 1px ${color}55;"></span>
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function clusterDivIcon(count: number, dominantColor: string): L.DivIcon {
  const size = count >= 50 ? 46 : count >= 20 ? 40 : count >= 8 ? 34 : 28;
  return L.divIcon({
    className: "incident-cluster",
    html: `
      <div style="
        width:${size}px;height:${size}px;border-radius:9999px;
        background:${dominantColor}26;border:2px solid ${dominantColor};
        display:flex;align-items:center;justify-content:center;
        color:#f4f6fa;font-weight:600;font-size:${count >= 100 ? 11 : 12}px;
        font-family:var(--font-sans,sans-serif);
        box-shadow:0 0 12px ${dominantColor}55;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
