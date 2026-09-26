"use client";

import { useEffect, useRef } from "react";

/** Escape-to-close and focus containment for an overlay.
 *
 * Returns a ref to put on the overlay's root. While `open`, Escape closes it,
 * Tab cycles within it, and focus moves inside on open and back to whatever
 * opened it on close — none of which the app had, so a keyboard user could
 * open a panel and then tab straight out behind it with no way back or out.
 *
 * `trapFocus: false` suits a panel that sits alongside the map rather than
 * over it, where holding focus captive would be wrong: Escape still closes.
 */
export function useDismissible<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  { trapFocus = true }: { trapFocus?: boolean } = {}
) {
  const ref = useRef<T>(null);
  // Read through a ref so a caller passing an inline arrow does not re-run
  // the effect — and tear down its listeners — on every render. Assigned in
  // its own effect rather than during render, which React disallows.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    if (trapFocus) focusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !trapFocus) return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Wrap at both ends, and pull focus back in if it has escaped the
      // overlay entirely (browser chrome, an earlier stray focus).
      if (e.shiftKey && (document.activeElement === first || !root?.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only reclaim focus if it is still inside the overlay being removed;
      // otherwise the reader has deliberately moved on and yanking it back
      // would be the rude thing.
      if (trapFocus && root?.contains(document.activeElement)) previous?.focus?.();
    };
  }, [open, trapFocus]);

  return ref;
}
