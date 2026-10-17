"use client";

/**
 * Catches a failure in the root layout itself — the case `app/error.tsx` cannot
 * handle, because the boundary it lives in never rendered.
 *
 * This file must render its own <html> and <body>, and it may not rely on any
 * provider (themes, toasts) because those live in the layout that just failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fafafa",
          color: "#111",
        }}
      >
        <main
          style={{
            maxWidth: 30,
            padding: "2rem",
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 .5rem" }}>ClubHub could not start this page</h1>
          <p style={{ fontSize: 14, color: "#525252", margin: "0 0 1rem" }}>
            The application shell failed to load. Reloading usually fixes it.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#737373" }}>
              ref {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: 12,
              padding: ".5rem 1rem",
              borderRadius: 8,
              border: "1px solid #d4d4d4",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
