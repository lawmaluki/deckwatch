"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { CopyButton } from "@/components/api/CopyButton";

interface Result {
  url: string;
  status: number;
  ms: number;
  bytes: number;
  body: string;
}

const PREVIEW_CHARS = 4000;

/** Sends one real request to the live API and shows what came back. */
export function TryIt({ path, fill }: { path: string; fill?: "latest-incident" }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setExpanded(false);
    try {
      let url = path;
      if (fill === "latest-incident") {
        // The example needs a real id, and ids change as news arrives.
        const latest = await fetch("/api/incidents?limit=1").then((r) => r.json());
        const id = latest?.results?.[0]?.id;
        if (!id) throw new Error("No incidents available to look up right now.");
        url = path.replace("{id}", encodeURIComponent(id));
      }
      const started = performance.now();
      const res = await fetch(url);
      const text = await res.text();
      const ms = Math.round(performance.now() - started);
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON: show as is
      }
      setResult({ url, status: res.status, ms, bytes: new Blob([text]).size, body });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }

  const absolute = result && typeof window !== "undefined" ? new URL(result.url, window.location.origin).toString() : "";
  const long = !!result && result.body.length > PREVIEW_CHARS;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-dim disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {loading ? "Sending…" : result ? "Send again" : "Try it"}
      </button>
      {error && <p className="text-xs text-critical">{error}</p>}
      {result && (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 font-mono text-[11px] text-muted">
            <span className={result.status < 400 ? "font-semibold text-brand" : "font-semibold text-critical"}>{result.status}</span>
            <span>{result.ms} ms</span>
            <span>{(result.bytes / 1024).toFixed(1)} KB</span>
            <span className="min-w-0 flex-1 truncate text-foreground/80">GET {result.url}</span>
            <CopyButton text={absolute} label="Copy URL" />
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <pre className="max-h-96 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
            {long && !expanded ? `${result.body.slice(0, PREVIEW_CHARS)}\n…` : result.body}
          </pre>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-border px-3 py-1.5 text-left text-[11px] text-muted hover:text-foreground"
            >
              {expanded ? "Show less" : `Show the full response (${(result.bytes / 1024).toFixed(0)} KB)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
