import { BillingError } from "./types"
import type { LimitEvaluation, PlanSummary, SubscriptionSummary } from "./types"

/**
 * Moteur de décision du Billing Engine — logique PURE, sans dépendance à la
 * base ni au fournisseur de paiement.
 *
 * La base de données reste la source de vérité d'exécution
 * (`consume_usage`, `can_use_feature`, …) : ce module sert de miroir typé et
 * testable pour le code serveur (Server Actions, Route Handlers) et les
 * pré-vérifications d'interface. Les deux implémentations partagent la même
 * sémantique (période, statut, bornes de limites) — documentée dans
 * `docs/billing.md`.
 */

/**
 * Un abonnement est « courant » s'il est en `trialing` ou `active` et que la
 * période englobe `now`. Expiré, `canceled` ou `past_due` → non courant.
 */
export function isSubscriptionActive(
  subscription: SubscriptionSummary,
  now: Date = new Date(),
): boolean {
  if (!["trialing", "active"].includes(subscription.status)) {
    return false
  }

  const start = new Date(subscription.currentPeriodStart).getTime()
  const end = new Date(subscription.currentPeriodEnd).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false
  }

  const t = now.getTime()
  return t >= start && t < end
}

/**
 * Plan effectif d'un abonnement : NULL tant que l'abonnement n'est pas courant.
 */
export function resolvePlan(
  subscription: SubscriptionSummary,
  plans: ReadonlyArray<PlanSummary>,
  now: Date = new Date(),
): PlanSummary | null {
  if (!isSubscriptionActive(subscription, now)) {
    return null
  }
  return plans.find((plan) => plan.code === subscription.planCode) ?? null
}

/**
 * Résolution du plan depuis la liste des abonnements d'une organisation :
 * le premier abonnement courant, sinon NULL (comportement « sans abonnement »).
 * La base garantit au plus un abonnement courant par organisation.
 */
export function resolvePlanFromSubscriptions(
  subscriptions: ReadonlyArray<SubscriptionSummary>,
  plans: ReadonlyArray<PlanSummary>,
  now: Date = new Date(),
): PlanSummary | null {
  const current = subscriptions.find((sub) => isSubscriptionActive(sub, now))
  return current ? resolvePlan(current, plans, now) : null
}

/**
 * Entitlement : la feature est-elle activée par le plan ?
 */
export function planHasFeature(
  plan: PlanSummary,
  feature: string,
): boolean {
  return plan.features.includes(feature)
}

/**
 * Valeur de limite d'une clé pour le plan. null = aucune limite définie
 * (consommation non bornée, documenté).
 */
export function getPlanLimit(
  plan: PlanSummary,
  limitKey: string,
): number | null {
  const value = plan.limits[limitKey]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * Évaluation d'une consommation : usage + quantité ≤ limite → autorisé.
 * Semantique des bornes :
 *   - limite NULL (non définie)      → toujours autorisé (sans plafond) ;
 *   - usage + quantité === limite    → autorisé ;
 *   - usage + quantité > limite      → refusé (une unité à usage = limite est
 *     donc refusée dès que la quantité est positive) ;
 *   - `remaining` est plafonné à 0 (affichage), l'autorisation reste la
 *     seule vérité.
 */
export function evaluateLimit(props: {
  usage: number
  limit: number | null
  requestedAmount: number
}): LimitEvaluation {
  const { usage, limit, requestedAmount } = props

  if (limit === null) {
    return { usage, limit, requestedAmount, allowed: true, remaining: null }
  }

  const allowed = usage + requestedAmount <= limit
  return {
    usage,
    limit,
    requestedAmount,
    allowed,
    remaining: Math.max(0, limit - usage),
  }
}

/**
 * Version « gate » : lève une erreur quand la consommation est refusée.
 * Utile pour les Server Actions qui doivent interrompre le flux métier.
 */
export function evaluateLimitOrThrow(props: {
  usage: number
  limit: number | null
  requestedAmount: number
}): LimitEvaluation {
  const evaluation = evaluateLimit(props)
  if (!evaluation.allowed) {
    throw new BillingError(
      "usage-limit-exceeded",
      evaluation.limit === null
        ? "Consommation refusée."
        : `Limite d'usage atteinte (${evaluation.limit}).`,
    )
  }
  return evaluation
}