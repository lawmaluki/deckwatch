"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

export interface NavGroup {
  date: string;
  label: string;
  entries: { id: string; title: string }[];
}

/** The jump-to rail, which also tracks what you're reading.
 *
 * Observation rather than scroll position: the entries are different heights,
 * so the topmost one still on screen is the one being read, and that's what
 * the observer reports without any arithmetic about offsets. */
export function ChangelogNav({ groups }: { groups: NavGroup[] }) {
  const ids = groups.flatMap((g) => g.entries.map((e) => e.id));
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          seen.set(record.target.id, record.isIntersecting);
        }
        const topmost = ids.find((id) => seen.get(id));
        if (topmost) setActiveId(topmost);
      },
      // Discount the top of the viewport so an entry counts as "being read"
      // once it has settled under the header rather than the moment it appears.
      { rootMargin: "-80px 0px -60% 0px" }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);

  return (
    <nav className="space-y-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted/70">
        Jump to
      </p>
      {groups.map((group) => (
        <div key={group.date} className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted/70">
            {group.label}
          </p>
          {group.entries.map((entry) => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              className={clsx(
                "block text-xs leading-snug transition-colors",
                entry.id === activeId
                  ? "font-semibold text-brand"
                  : "text-muted hover:text-foreground"
              )}
            >
              {entry.title}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
