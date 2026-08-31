"use client"

import { useEffect } from "react"

import { ErrorState } from "@/components/states/error-state"

export default function Error({
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="w-full max-w-md">
        <ErrorState
          title="Une erreur est survenue."
          description="Un problème est survenu lors du chargement de la page. Réessaie."
          onRetry={retry}
          retryLabel="Réessayer"
        />
      </div>
    </main>
  )
}
