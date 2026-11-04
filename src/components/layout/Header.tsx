"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Map, LayoutDashboard, Building2, ShieldAlert, Radio, Route } from "lucide-react";
import clsx from "clsx";
import { useUiStore } from "@/store/useUiStore";
import { useAppStore } from "@/store/useAppStore";
import { useIncidents } from "@/hooks/useIncidents";
import { hasActiveSubscription } from "@/lib/alerts";
import { withinHours } from "@/lib/stats";
import { LiveClock } from "@/components/layout/LiveClock";
import { ABOUT_LINKS, MoreMenu } from "@/components/layout/MoreMenu";
import { Fragment } from "react";

const NAV_LINKS = [
  { href: "/", label: "Live Map", icon: Map },
  { href: "/route-watch", label: "Route Watch", icon: Route },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/counties", label: "Counties", icon: Building2 },
];

export function Header() {
  const pathname = usePathname();
  const setNotificationsOpen = useUiStore((s) => s.setNotificationsOpen);
  const setIntelFeedOpen = useUiStore((s) => s.setIntelFeedOpen);
  const setTodayMode = useAppStore((s) => s.setTodayMode);
  const router = useRouter();

  // Today's incidents as breathing dots on the map. On a wide screen the feed
  // opens beside the map listing them; on a phone the feed is full-width and
  // would cover the very dots this is for, so the map comes first and the
  // map's "List" button opens the feed.
  const openToday = () => {
    setTodayMode(true);
    if (window.matchMedia("(min-width: 640px)").matches) setIntelFeedOpen(true);
    if (pathname !== "/") router.push("/");
  };
  const alertsConfigured = useAppStore((s) => hasActiveSubscription(s.notifications));
  const { incidents } = useIncidents();
  const activeToday = incidents.filter((i) => withinHours(i, 24)).length;
  const critical = incidents.filter(
    (i) => withinHours(i, 24) && i.severity === "critical"
  ).length;

  return (
    <header className="glass-panel sticky top-0 z-[1000] flex h-14 print:hidden shrink-0 items-center justify-between px-3 sm:px-5">
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
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-surface-raised text-foreground"
                    : "text-muted hover:text-foreground"
                )}
              >
                <link.icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-3 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted lg:flex">
          <button
            onClick={openToday}
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
        <div className="hidden items-center gap-1 rounded-full border border-border bg-surface px-1 py-1 text-xs font-medium text-muted lg:flex">
          {ABOUT_LINKS.map((link, i) => (
            <Fragment key={link.href}>
              {i > 0 && <span className="text-border">|</span>}
              <Link
                href={link.href}
                className="rounded-full px-2 py-1 transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                {link.label}
              </Link>
            </Fragment>
          ))}
        </div>
        <LiveClock />
        <button
          aria-label={`${activeToday} incidents today: show them on the map`}
          onClick={openToday}
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
          aria-label={
            alertsConfigured ? "Alert subscriptions active" : "Alert subscriptions"
          }
          onClick={() => setNotificationsOpen(true)}
          // Hidden where the bottom nav carries its own Alerts button
          // (MobileNav is md:hidden), so the two never show at once. Below
          // md this was a second bell opening the same modal, costing header
          // room on the screens with least of it.
          className="relative hidden h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:text-foreground md:flex"
        >
          <Bell className={clsx("h-4 w-4", alertsConfigured && "text-brand")} />
          {alertsConfigured && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
          )}
        </button>
        <MoreMenu />
      </div>
    </header>
  );
}