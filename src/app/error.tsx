"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/** Catches render errors below the root layout, so a failure keeps the header
 * and nav instead of replacing the site with Next's default screen. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack, which Next
    // withholds from the browser deliberately.
    console.error("Unhandled page error", error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-high" />
        <h1 className="mb-2 text-xl font-semibold text-foreground">
          Something went wrong on this page
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          This is a fault on our side, not a sign that nothing is happening.
          Incident data may be temporarily unreachable.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-black hover:bg-brand-dim"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-raised"
          >
            Back to the map
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 font-mono text-[11px] text-muted">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
