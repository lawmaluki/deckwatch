// Server-only seam to the FastAPI backend. When API_BASE_URL is set, the
// Next.js /api/* route handlers proxy to it (BFF pattern); otherwise they
// serve the local seed. Deliberately NOT NEXT_PUBLIC_ — the browser calls the
// same-origin Next routes and never sees the backend URL.
export const BACKEND_URL = process.env.API_BASE_URL;

import { cacheControl } from "@/lib/api-response";

// Forwards a request to the backend and mirrors its status + body. Next never
// caches the fetch itself; `cacheSeconds` lets the edge keep a successful
// response briefly for public callers (see api-response.ts).
export async function proxyJson(
  path: string,
  init?: RequestInit,
  { cacheSeconds }: { cacheSeconds?: number } = {}
): Promise<Response> {
  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, cache: "no-store" });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": cacheControl(cacheSeconds, res.ok),
    },
  });
}
