import { BillingError } from "./types"

type RpcErrorLike = { message?: string; code?: string } | null | undefined

/**
 * Traduit une erreur RPC Supabase en `BillingError` typé. Le moteur SQL lève
 * des exceptions aux messages stables (`no_active_subscription`,
 * `usage_limit_exceeded`, `invalid_amount`, `insufficient_permission`) ; le
 * mapping par contenu évite tout branchement sur une infrastructure
 * particulière.
 */
export function mapRpcError(error: RpcErrorLike): BillingError {
  const message = error?.message ?? ""

  if (/no_active_subscription|no active subscription/i.test(message)) {
    return new BillingError(
      "no-subscription",
      "Aucun abonnement actif pour cette organisation.",
    )
  }

  if (/usage_limit_exceeded|usage limit exceeded/i.test(message)) {
    return new BillingError(
      "usage-limit-exceeded",
      "Limite d'usage de cette organisation atteinte.",
    )
  }

  if (/invalid_amount|invalid amount/i.test(message)) {
    return new BillingError(
      "invalid-amount",
      "Quantité d'usage invalide.",
    )
  }

  if (/insufficient_permission|insufficient permission/i.test(message)) {
    return new BillingError(
      "forbidden",
      "Vous n'êtes pas membre de cette organisation.",
    )
  }

  return new BillingError(
    "internal",
    "Erreur interne du moteur de facturation.",
  )
}

export function isBillingError(error: unknown): error is BillingError {
  return error instanceof BillingError
}