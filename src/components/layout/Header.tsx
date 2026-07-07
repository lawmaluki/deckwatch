"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Map, LayoutDashboard, Building2, ShieldAlert, Radio } from "lucide-react";
import clsx from "clsx";
import { useUiStore } from "@/store/useUiStore";
import { MOCK_INCIDENTS } from "@/lib/data/mock-incidents";
import { withinHours } from "@/lib/stats";
import { LiveClock } from "@/components/layout/LiveClock";

const NAV_LINKS = [
  { href: "/", label: "Live Map", icon: Map },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/counties", label: "Counties", icon: Building2 },
];

export function Header() {
  const pathname = usePathname();
  const setNotificationsOpen = useUiStore((s) => s.setNotificationsOpen);
  const setIntelFeedOpen = useUiStore((s) => s.setIntelFeedOpen);
  const activeToday = MOCK_INCIDENTS.filter((i) => withinHours(i, 24)).length;
  const critical = MOCK_INCIDENTS.filter(
    (i) => withinHours(i, 24) && i.severity === "critical"
  ).length;

  return (
    <header className="glass-panel sticky top-0 z-[1000] flex h-14 shrink-0 items-center justify-between px-3 sm:px-5">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-brand" strokeWidth={2.2} />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Deckwatch <span className="text-brand">Kenya</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface-raised text-foreground"
                    : "text-muted hover:text-foreground"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-3 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted lg:flex">
          <button
            onClick={() => setIntelFeedOpen(true)}
            className="flex items-center gap-1.5 hover:text-foreground"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            {activeToday} incidents today
          </button>
          {critical > 0 && (
            <span className="flex items-center gap-1.5 text-critical">
              <span className="h-1.5 w-1.5 rounded-full bg-critical" />
              {critical} critical
            </span>
          )}
        </div>
        <div className="hidden items-center gap-1 rounded-full border border-border bg-surface px-1 py-1 text-[11px] font-medium text-muted lg:flex">
          <Link
            href="/why"
            className="rounded-full px-2 py-1 transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            Why Deckwatch
          </Link>
          <span className="text-border">|</span>
          <Link
            href="/api-docs"
            className="rounded-full px-2 py-1 transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            API
          </Link>
        </div>
        <LiveClock />
        <button
          aria-label="Intel feed"
          onClick={() => setIntelFeedOpen(true)}
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:text-foreground lg:hidden"
        >
          <Radio className="h-4 w-4" />
          {activeToday > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-black">
              {activeToday}
            </span>
          )}
        </button>
        <button
          aria-label="Notifications"
          onClick={() => setNotificationsOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}