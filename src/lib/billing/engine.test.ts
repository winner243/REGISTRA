import { describe, expect, it } from "vitest"

import {
  BillingError,
  evaluateLimit,
  evaluateLimitOrThrow,
  getPlanLimit,
  isSubscriptionActive,
  mapRpcError,
  planHasFeature,
  resolvePlan,
  resolvePlanFromSubscriptions,
} from "./index"
import type { PlanSummary, SubscriptionSummary } from "./types"

function makeSubscription(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    id: "sub-1",
    organizationId: "org-1",
    planCode: "pro",
    status: "active",
    currentPeriodStart: "2026-01-01T00:00:00.000Z",
    currentPeriodEnd: "2026-02-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    ...overrides,
  }
}

function makePlan(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    code: "pro",
    name: "Pro",
    description: null,
    features: ["feature.analytics", "feature.export", "feature.team"],
    limits: {
      "projects.max": 10,
      "exports.monthly": 100,
      "members.max": 10,
    },
    ...overrides,
  }
}

const NOW = new Date("2026-01-15T12:00:00.000Z")

describe("isSubscriptionActive", () => {
  it("est courant pendant la période en statut trialing ou active", () => {
    expect(isSubscriptionActive(makeSubscription({ status: "active" }), NOW)).toBe(true)
    expect(isSubscriptionActive(makeSubscription({ status: "trialing" }), NOW)).toBe(true)
  })

  it("n'est plus courant à partir de la fin de période (borne exclue)", () => {
    const expired = makeSubscription({ currentPeriodEnd: "2026-01-15T12:00:00.000Z" })
    expect(isSubscriptionActive(expired, NOW)).toBe(false)
  })

  it("est courant à partir du début de période (borne incluse)", () => {
    const starts = makeSubscription({ currentPeriodStart: "2026-01-15T12:00:00.000Z" })
    expect(isSubscriptionActive(starts, NOW)).toBe(true)
  })

  it("refuse past_due, canceled et les périodes passées", () => {
    expect(isSubscriptionActive(makeSubscription({ status: "past_due" }), NOW)).toBe(false)
    expect(isSubscriptionActive(makeSubscription({ status: "canceled" }), NOW)).toBe(false)
    expect(
      isSubscriptionActive(
        makeSubscription({ currentPeriodStart: "2025-01-01T00:00:00.000Z", currentPeriodEnd: "2025-02-01T00:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false)
  })

  it("reste courant jusqu'à la fin de période même si cancel_at_period_end", () => {
    expect(
      isSubscriptionActive(makeSubscription({ cancelAtPeriodEnd: true }), NOW),
    ).toBe(true)
  })

  it("refuse une période non datée (invalide)", () => {
    expect(
      isSubscriptionActive(makeSubscription({ currentPeriodStart: "", currentPeriodEnd: "" }), NOW),
    ).toBe(false)
  })
})

describe("resolvePlan / resolvePlanFromSubscriptions — détermination du plan", () => {
  const plans = [
    makePlan(),
    makePlan({ code: "business", name: "Business", features: ["feature.api"], limits: { "exports.monthly": 1000 } }),
  ]

  it("détermine le plan d'un abonnement actif", () => {
    expect(resolvePlan(makeSubscription(), plans, NOW)?.code).toBe("pro")
  })

  it("reflète un changement de plan", () => {
    const upgraded = makeSubscription({ planCode: "business" })
    expect(resolvePlan(upgraded, plans, NOW)?.code).toBe("business")
    expect(resolvePlan(upgraded, plans, NOW)?.features).toContain("feature.api")
  })

  it("retourne null sans abonnement courant (expiré / canceled / sans abonnement)", () => {
    expect(resolvePlan(makeSubscription({ status: "canceled" }), plans, NOW)).toBeNull()
    expect(resolvePlan(makeSubscription({ status: "past_due" }), plans, NOW)).toBeNull()
    expect(resolvePlanFromSubscriptions([], plans, NOW)).toBeNull()
  })

  it("retourne null si le plan n'existe pas dans le catalogue", () => {
    expect(resolvePlan(makeSubscription({ planCode: "unknown" }), plans, NOW)).toBeNull()
  })

  it("ignore les abonnements non courants et prend le premier courant", () => {
    const inactive = makeSubscription({ id: "sub-old", status: "canceled" })
    const active = makeSubscription({ id: "sub-new", planCode: "business" })
    expect(resolvePlanFromSubscriptions([inactive, active], plans, NOW)?.code).toBe("business")
  })
})

describe("planHasFeature — entitlements", () => {
  it("autorise une feature incluse dans le plan", () => {
    expect(planHasFeature(makePlan(), "feature.export")).toBe(true)
  })

  it("refuse une feature absente du plan", () => {
    expect(planHasFeature(makePlan(), "feature.api")).toBe(false)
  })
})

describe("getPlanLimit", () => {
  it("retourne la valeur définie pour une clé", () => {
    expect(getPlanLimit(makePlan(), "exports.monthly")).toBe(100)
  })

  it("retourne null pour une clé non définie (non borné)", () => {
    expect(getPlanLimit(makePlan(), "api.requests.monthly")).toBeNull()
  })
})

describe("evaluateLimit — limites", () => {
  it("usage inférieur à la limite → autorisé, restant correct", () => {
    const ev = evaluateLimit({ usage: 99, limit: 100, requestedAmount: 1 })
    expect(ev).toMatchObject({ allowed: true, usage: 99, remaining: 1 })
  })

  it("usage + quantité = limite → autorisé (borne atteinte, pas dépassée)", () => {
    expect(evaluateLimit({ usage: 100, limit: 100, requestedAmount: 0 }).allowed).toBe(true)
    expect(evaluateLimit({ usage: 50, limit: 100, requestedAmount: 50 }).allowed).toBe(true)
    expect(evaluateLimit({ usage: 100, limit: 100, requestedAmount: 0 }).remaining).toBe(0)
  })

  it("usage = limite + nouvelle unité positive → REFUSÉ", () => {
    const ev = evaluateLimit({ usage: 100, limit: 100, requestedAmount: 1 })
    expect(ev.allowed).toBe(false)
  })

  it("dépassement → REFUSÉ", () => {
    expect(evaluateLimit({ usage: 101, limit: 100, requestedAmount: 1 }).allowed).toBe(false)
    expect(evaluateLimit({ usage: 100, limit: 100, requestedAmount: 50 }).allowed).toBe(false)
  })

  it("sans limite définie → toujours autorisé, restant null", () => {
    const ev = evaluateLimit({ usage: 500, limit: null, requestedAmount: 100 })
    expect(ev).toMatchObject({ allowed: true, remaining: null })
  })

  it("`remaining` est plafonné à 0 (affichage uniquement)", () => {
    expect(evaluateLimit({ usage: 120, limit: 100, requestedAmount: 0 }).remaining).toBe(0)
  })
})

describe("evaluateLimitOrThrow", () => {
  it("retourne l'évaluation quand la consommation est autorisée", () => {
    expect(evaluateLimitOrThrow({ usage: 10, limit: 100, requestedAmount: 1 }).allowed).toBe(true)
  })

  it("lève BillingError usage-limit-exceeded quand refusée", () => {
    expect(() =>
      evaluateLimitOrThrow({ usage: 100, limit: 100, requestedAmount: 1 }),
    ).toThrowError(BillingError)
    expect(() =>
      evaluateLimitOrThrow({ usage: 100, limit: 100, requestedAmount: 1 }),
    ).toThrowError(expect.objectContaining({ code: "usage-limit-exceeded" }))
  })
})

describe("Billing — comportements définis sans abonnement valide", () => {
  const plans = [
    makePlan(),
    makePlan({ code: "business", limits: { "exports.monthly": 1000 } }),
  ]

  it("organisation sans abonnement → aucun plan, aucune feature", () => {
    expect(resolvePlanFromSubscriptions([], plans, NOW)).toBeNull()
    const noPlan = resolvePlanFromSubscriptions([], plans, NOW)
    if (noPlan) {
      expect(planHasFeature(noPlan, "feature.export")).toBe(false)
    }
  })

  it("abonnement expiré → plan null, feature refusée", () => {
    const expired = makeSubscription({
      currentPeriodStart: "2025-12-01T00:00:00.000Z",
      currentPeriodEnd: "2026-01-01T00:00:00.000Z",
    })
    expect(resolvePlanFromSubscriptions([expired], plans, NOW)).toBeNull()
  })

  it("répercute la sémantique up/downgrade via le plan résolu", () => {
    const business = resolvePlanFromSubscriptions(
      [makeSubscription({ planCode: "business" })],
      plans,
      NOW,
    )
    expect(business?.code).toBe("business")
    expect(getPlanLimit(business as PlanSummary, "exports.monthly")).toBe(1000)
  })
})

describe("mapRpcError — mapping des erreurs du moteur SQL", () => {
  it("mappe les messages stables vers des codes BillingError", () => {
    expect(mapRpcError({ message: 'no_active_subscription' }).code).toBe("no-subscription")
    expect(mapRpcError({ message: "usage_limit_exceeded" }).code).toBe("usage-limit-exceeded")
    expect(mapRpcError({ message: "invalid_amount" }).code).toBe("invalid-amount")
    expect(mapRpcError({ message: "insufficient_permission" }).code).toBe("forbidden")
    expect(mapRpcError({ message: "anything else" }).code).toBe("internal")
  })

  it("gère une erreur absente ou vide", () => {
    expect(mapRpcError(null).code).toBe("internal")
    expect(mapRpcError(undefined).code).toBe("internal")
    expect(mapRpcError({}).code).toBe("internal")
  })
})