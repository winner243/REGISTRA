"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // Log technique : jamais affiché à l'utilisateur final.
    console.error(error)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1rem",
            textAlign: "center",
            fontFamily:
              "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            backgroundColor: "var(--background, #ffffff)",
            color: "var(--foreground, #111827)",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Une erreur est survenue.
          </h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            Un problème est survenu. Réessaie.
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
