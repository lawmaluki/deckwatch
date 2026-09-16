"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, LayoutDashboard, Building2, Bell } from "lucide-react";
import clsx from "clsx";
import { useUiStore } from "@/store/useUiStore";
import { useAppStore } from "@/store/useAppStore";
import { hasActiveSubscription } from "@/lib/alerts";

const LINKS = [
  { href: "/", label: "Map", icon: Map },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/counties", label: "Counties", icon: Building2 },
];

export function MobileNav() {
  const pathname = usePathname();
  const setNotificationsOpen = useUiStore((s) => s.setNotificationsOpen);
  const alertsConfigured = useAppStore((s) => hasActiveSubscription(s.notifications));

  return (
    <nav className="glass-panel fixed inset-x-0 bottom-0 z-[1000] flex h-14 items-center justify-around md:hidden">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium",
              active ? "text-brand" : "text-muted"
            )}
          >
            <link.icon className="h-5 w-5" />
            {link.label}
          </Link>
        );
      })}
      <button
        onClick={() => setNotificationsOpen(true)}
        className={clsx(
          "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium",
          alertsConfigured ? "text-brand" : "text-muted"
        )}
      >
        <span className="relative">
          <Bell className="h-5 w-5" />
          {alertsConfigured && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-brand" />
          )}
        </span>
        Alerts
      </button>
    </nav>
  );
}
