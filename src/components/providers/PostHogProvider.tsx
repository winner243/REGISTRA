"use client"

import posthog from "posthog-js"
import {
  PostHogProvider as PostHogReactProvider,
  usePostHog,
} from "posthog-js/react"
import { usePathname } from "next/navigation"
import { useEffect, type ReactNode } from "react"

import { getPostHogEnv, isPostHogConfigured } from "@/lib/analytics/config"

const configured = isPostHogConfigured()

if (configured) {
  const { key, host } = getPostHogEnv()

  posthog.init(key, {
    api_host: host,
    // Pageview géré manuellement via <PostHogPageview/> (App Router).
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  })
}

/**
 * Fournisseur racine. Initialise PostHog uniquement si la clé publique
 * est présente ; sinon rend les enfants sans effet (le SaaS ne dépend
 * jamais de PostHog).
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  if (!configured) {
    return <>{children}</>
  }

  return <PostHogReactProvider client={posthog}>{children}</PostHogReactProvider>
}

/**
 * Capture une « page.viewed » à chaque changement de route (visites + navigation).
 */
export function PostHogPageview() {
  const pathname = usePathname()
  const posthogClient = usePostHog()

  useEffect(() => {
    if (configured && pathname) {
      posthogClient.capture("$pageview", { path: pathname })
    }
  }, [pathname, posthogClient])

  return null
}
