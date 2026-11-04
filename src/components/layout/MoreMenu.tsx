"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, FileText, Info, MoreHorizontal, ShieldCheck, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useDismissible } from "@/hooks/useDismissible";

/** Pages about Deckwatch itself, as opposed to the data pages in the main nav.
 * Shown inline in the header on wide screens and in this menu below that. */
export const ABOUT_LINKS = [
  { href: "/why", label: "Why Deckwatch", description: "What it's for and how it works", icon: Info },
  { href: "/whats-new", label: "What’s new", description: "Recent changes to the app", icon: Sparkles },
  { href: "/api-docs", label: "API", description: "Use the incident data in your own work", icon: Code2 },
];

/** The policies. Rarely visited, so they live only in this menu, never inline. */
export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy", description: "What we collect, and your rights", icon: ShieldCheck },
  { href: "/terms", label: "Terms of Use", description: "Using Deckwatch, and corrections", icon: FileText },
];

/** Header menu. Below lg it carries the about links, which have no room
 * inline there; at every width it carries the policies. */
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapper = useRef<HTMLDivElement>(null);
  const panel = useDismissible<HTMLDivElement>(open, () => setOpen(false), { trapFocus: false });

  // Close on a tap or click anywhere outside the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onAboutPage = ABOUT_LINKS.some((l) => pathname.startsWith(l.href));
  const onLegalPage = LEGAL_LINKS.some((l) => pathname.startsWith(l.href));

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface transition-colors hover:text-foreground",
          // About pages light the inline header links from lg up, not this.
          open || onLegalPage ? "text-foreground" : onAboutPage ? "text-foreground lg:text-muted" : "text-muted"
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          ref={panel}
          role="menu"
          aria-label="More about Deckwatch"
          className="absolute right-0 top-full z-[1500] mt-2 w-64 rounded-xl border border-border bg-surface-raised p-1.5 shadow-2xl"
        >
          {[...ABOUT_LINKS, ...LEGAL_LINKS].map((link) => {
            const active = pathname.startsWith(link.href);
            const about = ABOUT_LINKS.includes(link);
            return (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={clsx(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface",
                  active && "bg-surface",
                  // Inline in the header from lg up, so not repeated here.
                  about && "lg:hidden",
                  link === LEGAL_LINKS[0] && "max-lg:mt-1.5 max-lg:rounded-t-none max-lg:border-t max-lg:border-border max-lg:pt-3"
                )}
              >
                <link.icon className={clsx("mt-0.5 h-4 w-4 shrink-0", active ? "text-brand" : "text-muted")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{link.label}</span>
                  <span className="block text-xs text-muted">{link.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
