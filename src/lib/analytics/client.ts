"use client"

import posthog from "posthog-js"

import type { AnalyticsEvent, AnalyticsProperties } from "./events"

/**
 * Couche fournisseur (remplaçable).
 *
 * Centralise les appels au SDK concret (ici PostHog). Le reste de
 * l'application ne doit dépendre que de l'API publique (« index.ts »),
 * jamais directement de cette couche ni du SDK.
 */
export const analyticsProvider = {
  track(eventName: AnalyticsEvent, properties?: AnalyticsProperties) {
    if (typeof window === "undefined") return
    posthog.capture(eventName, properties)
  },

  identify(userId: string) {
    if (typeof window === "undefined") return
    // userId doit être un identifiant stable et non personnel (pas d'email).
    posthog.identify(userId)
  },

  reset() {
    if (typeof window === "undefined") return
    posthog.reset()
  },

  disable() {
    if (typeof window === "undefined") return
    posthog.opt_out_capturing()
  },
}
