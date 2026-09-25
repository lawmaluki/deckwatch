import { CloudOff } from "lucide-react";

/** Shown when the backend could not be reached.
 *
 * Without it the page renders zeroes, and a reader cannot tell an outage from
 * a quiet week — the figures would read as a country with no incidents. */
export function DataUnavailableNotice() {
  return (
    <div className="mb-5 flex gap-3 rounded-2xl border border-high/30 bg-high/10 p-4">
      <CloudOff className="h-5 w-5 shrink-0 text-high" />
      <p className="text-sm leading-relaxed text-foreground/90">
        <span className="font-semibold">Live data is unavailable right now.</span>{" "}
        Deckwatch could not reach the incident service, so the figures below are
        empty rather than current — they are not a count of what has happened.
        Try again shortly.
      </p>
    </div>
  );
}
