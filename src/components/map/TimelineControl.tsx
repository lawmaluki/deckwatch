"use client";

import { useEffect } from "react";
import { Play, Pause, History, X } from "lucide-react";
import clsx from "clsx";
import { useAppStore, type TimelineRange } from "@/store/useAppStore";
import { DATA_REFERENCE_TIME } from "@/lib/data/mock-incidents";

const RANGE_OPTIONS: { label: string; value: TimelineRange }[] = [
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
];

export function TimelineToggle() {
  const timelineMode = useAppStore((s) => s.timelineMode);
  const setTimelineMode = useAppStore((s) => s.setTimelineMode);

  return (
    <button
      onClick={() => setTimelineMode(!timelineMode)}
      className={clsx(
        "glass-panel pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
        timelineMode ? "text-brand" : "text-foreground/90"
      )}
    >
      <History className="h-3.5 w-3.5" />
      Timeline
    </button>
  );
}

export function TimelineControl() {
  const timelineMode = useAppStore((s) => s.timelineMode);
  const range = useAppStore((s) => s.timelineRange);
  const setTimelineRange = useAppStore((s) => s.setTimelineRange);
  const cursor = useAppStore((s) => s.timelineCursor);
  const setCursor = useAppStore((s) => s.setTimelineCursor);
  const playing = useAppStore((s) => s.timelinePlaying);
  const setPlaying = useAppStore((s) => s.setTimelinePlaying);
  const setTimelineMode = useAppStore((s) => s.setTimelineMode);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      const next = cursor + 0.006;
      if (next >= 1) {
        setCursor(1);
        setPlaying(false);
      } else {
        setCursor(next);
      }
    }, 60);
    return () => clearInterval(interval);
  }, [playing, cursor, setCursor, setPlaying]);

  if (!timelineMode) return null;

  const windowStart = new Date(DATA_REFERENCE_TIME.getTime() - range * 60 * 60 * 1000);
  const currentTime = new Date(
    windowStart.getTime() + cursor * (DATA_REFERENCE_TIME.getTime() - windowStart.getTime())
  );

  return (
    <div className="glass-panel pointer-events-auto flex w-full flex-col gap-2 rounded-2xl px-3 py-3 sm:w-auto sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimelineRange(opt.value)}
              className={clsx(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                range === opt.value ? "bg-brand text-black" : "bg-surface text-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setTimelineMode(false)}
          className="shrink-0 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => {
            if (cursor >= 1) setCursor(0);
            setPlaying(!playing);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-black"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 pl-0.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(Number(e.target.value));
          }}
          className="min-w-0 flex-1 accent-brand sm:w-72 sm:flex-none"
        />
        <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">
          {currentTime.toLocaleString("en-KE", {
            timeZone: "Africa/Nairobi",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
