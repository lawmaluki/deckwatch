"use client";

import { useRef, useState } from "react";
import type { DayRow } from "@/lib/monthly-reports";

const W = 720;
const H = 190;
const PL = 26;
const PB = 22;
const PT = 10;

export function DailyTimeline({
  days,
  coverageFrom,
  monthShort,
}: {
  days: DayRow[];
  /** Day of month full coverage starts, or 1. */
  coverageFrom: number;
  monthShort: string;
}) {
  const [hover, setHover] = useState<{ day: DayRow; x: number; y: number; w: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const bw = (W - PL) / days.length;
  const max = Math.max(2, ...days.map((d) => d.incidents));
  const yMax = Math.ceil(max / 2) * 2;
  const y = (n: number) => PT + (H - PT - PB) * (1 - n / yMax);
  const peak = days.reduce((a, b) => (b.incidents > a.incidents ? b : a));
  const ticks = Array.from({ length: yMax / 2 + 1 }, (_, i) => i * 2);

  return (
    <div ref={box} className="relative rounded-2xl border border-border bg-surface px-4 pb-2 pt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={`Incidents captured per day, ${monthShort}`}
        onMouseLeave={() => setHover(null)}
      >
        {coverageFrom > 1 && (
          <>
            <rect x={PL} y={PT} width={bw * (coverageFrom - 1)} height={H - PT - PB} rx={4} fill="var(--surface-raised)" />
            <text x={PL + 8} y={PT + 14} className="fill-muted font-mono text-[10px]">
              Partial coverage
            </text>
          </>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" className="fill-muted font-mono text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {days.map((d) => {
          const x = PL + (d.day - 1) * bw;
          const on = hover?.day.day === d.day;
          return (
            <g
              key={d.day}
              className="cursor-default"
              onMouseMove={(ev) => {
                const r = box.current!.getBoundingClientRect();
                setHover({ day: d, x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width });
              }}
            >
              <rect x={x} y={PT} width={bw} height={H - PT - PB} fill="transparent" />
              {d.incidents > 0 && (
                <rect
                  x={x + 3}
                  y={y(d.incidents)}
                  width={Math.max(2, bw - 6)}
                  height={y(0) - y(d.incidents)}
                  rx={3}
                  fill={
                    on
                      ? "var(--foreground)"
                      : d.day < coverageFrom
                        ? "color-mix(in srgb, var(--brand) 40%, var(--surface-raised))"
                        : "var(--brand)"
                  }
                />
              )}
              {(d.day === 1 || d.day % 5 === 0 || d.day === coverageFrom) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted font-mono text-[10px]">
                  {d.day}
                </text>
              )}
            </g>
          );
        })}
        {peak.incidents > 0 && (
          <text x={PL + (peak.day - 1) * bw + bw / 2} y={y(peak.incidents) - 5} textAnchor="middle" className="fill-foreground font-mono text-[10px]">
            {peak.incidents}
          </text>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-[250px] rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-xs leading-snug shadow-xl"
          style={{
            left: Math.min(hover.x + 14, hover.w - 260),
            top: Math.max(8, hover.y - 90),
          }}
        >
          <b className="font-semibold text-foreground">
            {hover.day.day} {monthShort}
          </b>
          <br />
          {hover.day.incidents} incident{hover.day.incidents === 1 ? "" : "s"} · {hover.day.deaths} deaths
          {hover.day.events.slice(0, 3).map((e) => (
            <span key={e.key} className="mt-0.5 block truncate font-mono text-muted">
              {e.title}
            </span>
          ))}
          {hover.day.events.length > 3 && (
            <span className="block font-mono text-muted">+{hover.day.events.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  );
}
