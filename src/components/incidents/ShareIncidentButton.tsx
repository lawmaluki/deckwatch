"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import type { Incident } from "@/lib/types";
import { incidentShareText, incidentShareUrl } from "@/lib/share";

/** Shares a link to the incident's own page.
 *
 * The system share sheet where there is one (phones, mostly — straight into
 * WhatsApp or SMS); otherwise the link goes to the clipboard and the button
 * says so.
 */
export function ShareIncidentButton({
  incident,
}: {
  incident: Pick<Incident, "id" | "title" | "locationName" | "county">;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function share() {
    const url = incidentShareUrl(incident.id, window.location.origin);
    const text = incidentShareText(incident);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: incident.title, text, url });
        return;
      } catch (err) {
        // Closing the sheet is a choice, not a failure to fall back from.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (insecure context, permissions): the prompt is the
      // last way left to hand the link over.
      window.prompt("Copy this link to share the incident", url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Link copied" : "Share this incident"}
      title={copied ? "Link copied" : "Share"}
      className="flex shrink-0 items-center gap-1 rounded-md p-1 text-xs text-muted hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-brand" />
          <span className="text-brand" aria-live="polite">Copied</span>
        </>
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </button>
  );
}
