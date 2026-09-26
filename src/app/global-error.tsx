"use client";

import { useEffect } from "react";

/** Last resort: only fires when the root layout itself fails, which is why
 * it has to ship its own <html>/<body> and inline styles — nothing from the
 * app, including globals.css, is guaranteed to have loaded. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05070a",
          color: "#e7ebf1",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Deckwatch failed to load
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#8993a4", lineHeight: 1.6 }}>
            Something went wrong before the page could start. Reloading usually
            clears it.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#22c55e",
              color: "#000",
              border: 0,
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
