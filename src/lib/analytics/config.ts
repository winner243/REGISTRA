const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

export function isPostHogConfigured() {
  return Boolean(posthogKey)
}

export function getPostHogEnv() {
  if (!posthogKey) {
    throw new Error(
      "PostHog n'est pas configuré. Ajoute NEXT_PUBLIC_POSTHOG_KEY dans " +
        "votre fichier .env.local (voir .env.example)."
    )
  }

  return {
    key: posthogKey,
    host: posthogHost || undefined,
  }
}
