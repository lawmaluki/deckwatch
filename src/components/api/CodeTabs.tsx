"use client";

import { useState } from "react";
import clsx from "clsx";
import { CopyButton } from "@/components/api/CopyButton";

export function CodeTabs({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2">
        <div role="tablist" className="flex">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={clsx(
                "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                i === active ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-foreground/90">{tab.code}</pre>
    </div>
  );
}
