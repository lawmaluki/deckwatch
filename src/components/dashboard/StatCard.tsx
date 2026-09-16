"use client";

import Link from "next/link";
import clsx from "clsx";
import { useMapFocus, type FocusAction } from "@/hooks/useMapFocus";

export function StatCard({
  label,
  value,
  icon,
  accent,
  sublabel,
  action,
  href,
}: {
  label: string;
  value: string | number;
  /** A rendered element, not the component: this card is a client component,
   * and a function prop can't cross the boundary from a server page. */
  icon: React.ReactNode;
  accent?: string;
  sublabel?: string;
  /** Scopes the live map to this card's figure. */
  action?: FocusAction;
  /** For cards whose subject is a page of its own, e.g. a county. */
  href?: string;
}) {
  const focus = useMapFocus();
  const interactive = !!action || !!href;

  const className = clsx(
    "block w-full rounded-2xl border border-border bg-surface p-4 text-left",
    interactive &&
      "transition-colors hover:border-brand/40 hover:bg-surface-raised focus-visible:border-brand/60 focus-visible:outline-none"
  );

  const body = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="shrink-0" style={{ color: accent ?? "var(--brand)" }}>
          {icon}
        </span>
      </div>
      <p className="truncate text-2xl font-semibold text-foreground">{value}</p>
      {sublabel && <p className="mt-1 truncate text-[11px] text-muted">{sublabel}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  if (action) {
    return (
      <button type="button" onClick={() => focus(action)} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
