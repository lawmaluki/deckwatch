"use client";

import { useEffect, useState } from "react";

const NAIROBI_TZ = "Africa/Nairobi";

function formatDateLine(date: Date): string {
  return date
    .toLocaleDateString("en-GB", {
      timeZone: NAIROBI_TZ,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

function formatTimeLine(date: Date): string {
  const time = date.toLocaleTimeString("en-GB", {
    timeZone: NAIROBI_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${time} EAT`;
}

export function LiveClock() {
  // Server and client render at slightly different instants — the mismatch
  // is expected here and intentionally suppressed below, per React's
  // documented pattern for clock-style components.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hidden flex-col items-end leading-tight lg:flex">
      <span
        suppressHydrationWarning
        className="text-[10px] font-medium tracking-wide text-muted"
      >
        {formatDateLine(now)}
      </span>
      <span suppressHydrationWarning className="font-mono text-[11px] text-foreground/80">
        {formatTimeLine(now)}
      </span>
    </div>
  );
}
