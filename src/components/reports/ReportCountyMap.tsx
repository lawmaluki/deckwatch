"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REPORT_CATEGORY_LABELS, type CountyRow } from "@/lib/monthly-reports";
import { useReportSelection } from "@/components/reports/ReportSelection";

type Ring = [number, number][];
interface CountyShape {
  name: string;
  code: number;
  d: string;
}

// Equirectangular is fine this close to the equator: Kenya spans ~10° of
// latitude, where the east-west stretch stays under 1.5%.
const LNG0 = 33.85;
const LAT0 = 5.1;
const K = 62;
const W = Math.round((41.95 - LNG0) * K);
const H = Math.round((LAT0 + 4.75) * K);

function ringPath(ring: Ring): string {
  let out = "";
  let last = "";
  for (const [lng, lat] of ring) {
    const x = ((lng - LNG0) * K).toFixed(1);
    const y = ((LAT0 - lat) * K).toFixed(1);
    const key = `${x},${y}`;
    if (key === last) continue;
    out += (out ? "L" : "M") + key;
    last = key;
  }
  return out ? out + "Z" : "";
}

// Shade steps: 0, 1, 2, 3-4, 5-9, 10+ incidents.
const SHADE_STEPS: { label: string; min: number }[] = [
  { label: "0", min: 0 },
  { label: "1", min: 1 },
  { label: "2", min: 2 },
  { label: "3–4", min: 3 },
  { label: "5–9", min: 5 },
  { label: "10+", min: 10 },
];
const MIX = [0, 22, 38, 56, 76, 100];

function shade(n: number): string {
  let step = 0;
  SHADE_STEPS.forEach((s, i) => {
    if (n >= s.min) step = i;
  });
  return step === 0
    ? "var(--surface-raised)"
    : `color-mix(in srgb, var(--brand) ${MIX[step]}%, var(--surface-raised))`;
}

export function ReportCountyMap({ counties }: { counties: CountyRow[] }) {
  const { county: selected, select } = useReportSelection();
  const [shapes, setShapes] = useState<CountyShape[] | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; w: number; name: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const byName = useMemo(() => new Map(counties.map((c) => [c.county, c])), [counties]);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/kenya-counties.geojson")
      .then((r) => r.json())
      .then((geo: { features: { properties: { name: string; countyCode: number }; geometry: { type: string; coordinates: unknown } }[] }) => {
        if (cancelled) return;
        setShapes(
          geo.features.map((f) => {
            const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
            return {
              name: f.properties.name,
              code: f.properties.countyCode,
              d: polys.map((p) => p.map(ringPath).join("")).join(""),
            };
          })
        );
      })
      .catch(() => !cancelled && setShapes([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const hovered = tip ? byName.get(tip.name) : undefined;

  return (
    <div ref={box} className="relative rounded-2xl border border-border bg-surface p-3">
      {shapes === null ? (
        <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-surface-raised" />
      ) : (
        <svg
          viewBox={`-4 -4 ${W + 8} ${H + 8}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Map of Kenya's 47 counties shaded by incidents captured this month"
          onMouseLeave={() => setTip(null)}
        >
          {shapes.map((s) => {
            const row = byName.get(s.name);
            return (
              <path
                key={s.name}
                d={s.d}
                fillRule="evenodd"
                fill={shade(row?.incidents ?? 0)}
                stroke={s.name === selected ? "var(--foreground)" : "var(--background)"}
                strokeWidth={s.name === selected ? 1.6 : 0.8}
                strokeLinejoin="round"
                className={row ? "cursor-pointer" : undefined}
                onMouseMove={(ev) => {
                  const r = box.current!.getBoundingClientRect();
                  setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, name: s.name });
                }}
                onClick={() => row && select(s.name, { scroll: true })}
              >
                <title>{`${s.name}: ${row?.incidents ?? 0} incidents`}</title>
              </path>
            );
          })}
        </svg>
      )}
      <div className="flex flex-wrap items-center gap-3 px-1 pt-2 font-mono text-[11px] text-muted">
        <span>Incidents</span>
        {SHADE_STEPS.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: shade(s.min) }} />
            {s.label}
          </span>
        ))}
      </div>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[240px] rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-xs leading-snug shadow-xl"
          style={{ left: Math.min(tip.x + 14, tip.w - 200), top: tip.y + 14 }}
        >
          <b className="font-semibold text-foreground">{tip.name}</b>
          <br />
          {hovered ? (
            <>
              {hovered.incidents} incident{hovered.incidents === 1 ? "" : "s"} · {hovered.deaths} deaths
              <br />
              <span className="font-mono text-muted">Mostly {REPORT_CATEGORY_LABELS[hovered.mainConcern].toLowerCase()}</span>
            </>
          ) : (
            <span className="text-muted">No incidents captured</span>
          )}
        </div>
      )}
    </div>
  );
}
