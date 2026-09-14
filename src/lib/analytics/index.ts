"use client"

import { analyticsProvider } from "./client"
import type { AnalyticsEvent, AnalyticsProperties } from "./events"

/**
 * API publique de mesure.
 *
 * Utilisation :
 *   import { track, identify } from "@/lib/analytics"
 *
 *   track("user.signed_up", { source: "landing" })
 *   identify(userId)   // userId = identifiant stable non personnel
 *   disableAnalytics() // selon le consentement
 */
export function track(eventName: AnalyticsEvent, properties?: AnalyticsProperties) {
  analyticsProvider.track(eventName, properties)
}

export function identify(userId: string) {
  analyticsProvider.identify(userId)
}

export function resetAnalytics() {
  analyticsProvider.reset()
}

export function disableAnalytics() {
  analyticsProvider.disable()
}

export * from "./events"
