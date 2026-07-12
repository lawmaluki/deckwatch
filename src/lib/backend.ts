// Server-only seam to the FastAPI backend. When API_BASE_URL is set, the
// Next.js /api/* route handlers proxy to it (BFF pattern); otherwise they
// serve the local seed. Deliberately NOT NEXT_PUBLIC_ — the browser calls the
// same-origin Next routes and never sees the backend URL.
export const BACKEND_URL = process.env.API_BASE_URL;

// Forwards a request to the backend and mirrors its status + body. The backend
// re-anchors data per request, so responses are never cached.
export async function proxyJson(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, cache: "no-store" });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
}
