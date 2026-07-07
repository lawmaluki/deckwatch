"use client";

import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationsModal } from "@/components/notifications/NotificationsModal";
import { IntelFeedPanel } from "@/components/incidents/IntelFeedPanel";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="relative flex-1 overflow-hidden pb-14 md:pb-0">{children}</main>
      <MobileNav />
      <NotificationsModal />
      <IntelFeedPanel />
    </>
  );
}
