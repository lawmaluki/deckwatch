"use client";

import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationsModal } from "@/components/notifications/NotificationsModal";
import { AlertRuntime } from "@/components/notifications/AlertRuntime";
import { IntelFeedPanel } from "@/components/incidents/IntelFeedPanel";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* First Tab on any page: the header and nav are the same on all of
          them, so a keyboard user should not have to walk past them. */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" className="relative flex-1 overflow-hidden pb-14 md:pb-0">
        {children}
      </main>
      <MobileNav />
      <NotificationsModal />
      <IntelFeedPanel />
      <AlertRuntime />
    </>
  );
}
