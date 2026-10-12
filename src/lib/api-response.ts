// Caching for the public API. Responses that succeed are cached at the edge
// (Vercel's CDN) for a short while, so outside callers hitting the API don't
// each wake the Render backend: the data only moves when the ingest cron runs
// every 15 minutes, so a few minutes of staleness costs nothing. Errors are never
// cached, so a bad request or a backend hiccup isn't served to everyone after.

/** Seconds a successful response may be served from the edge cache. */
export const API_CACHE_SECONDS = {
  /** Incident lists and county figures: move with every ingest run (every
   * 15 minutes), and the backend caches them for 5 minutes anyway. */
  live: 300,
  /** Monthly report archive: a new entry at most once a month. */
  reportList: 600,
  /** A single monthly report: written once at month end. */
  report: 3600,
} as const;

export function cacheControl(seconds: number | undefined, ok: boolean): string {
  if (!ok || !seconds) return "no-store";
  // Serve a stale copy for a while after expiry while one request refreshes it.
  return `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`;
}

/** Response.json with the API's caching rules applied. */
export function apiJson(body: unknown, { status = 200, cacheSeconds }: { status?: number; cacheSeconds?: number } = {}): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": cacheControl(cacheSeconds, status < 400) },
  });
}
