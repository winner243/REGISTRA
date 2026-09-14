import { createSupabaseServerClient } from "@/lib/supabase/server"

import { mapRpcError } from "./errors"
import { BillingError } from "./types"
import type { UsageStatusRow } from "./types"

/**
 * Accès RPC au moteur SQL du Billing Engine (côté serveur uniquement).
 *
 * La base reste la source de vérité : ces wrappers ne font que transporter
 * l'identité de session et l'`organization_id` fournie par le code serveur.
 * Le rôle `anon` ne possède aucun chemin d'exécution sur ces fonctions.
 */

async function client() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    throw new BillingError(
      "internal",
      "Supabase n'est pas configuré : moteur de facturation indisponible.",
    )
  }
  return supabase
}

/** Plan effectif de l'organisation (NULL sans abonnement courant). */
export async function getOrganizationPlan(
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await (await client()).rpc("get_organization_plan", {
    p_organization_id: organizationId,
  })
  if (error) {
    return null
  }
  return (data as string | null) ?? null
}

/** Entitlement : la feature est-elle activée par le plan courant ? */
export async function canUseFeature(
  organizationId: string,
  feature: string,
): Promise<boolean> {
  const { data, error } = await (await client()).rpc("can_use_feature", {
    p_organization_id: organizationId,
    p_feature: feature,
  })
  if (error) {
    return false
  }
  return data === true
}

/** Valeur de limite d'une clé pour le plan courant (NULL = non définie). */
export async function getOrganizationPlanLimit(
  organizationId: string,
  limitKey: string,
): Promise<number | null> {
  const { data, error } = await (await client()).rpc("get_plan_limit", {
    p_organization_id: organizationId,
    p_limit_key: limitKey,
  })
  if (error) {
    return null
  }
  return typeof data === "number" ? data : null
}

/** Usage agrégé d'une clé sur la période courante (0 par défaut). */
export async function getUsage(
  organizationId: string,
  usageKey: string,
): Promise<number> {
  const { data, error } = await (await client()).rpc("get_usage", {
    p_organization_id: organizationId,
    p_usage_key: usageKey,
  })
  if (error) {
    return 0
  }
  return typeof data === "number" ? data : 0
}

/** Pré-vérification indicative (seul `consumeUsage` décide réellement). */
export async function canConsumeUsage(
  organizationId: string,
  usageKey: string,
  amount: number,
): Promise<boolean> {
  const { data, error } = await (await client()).rpc("can_consume_usage", {
    p_organization_id: organizationId,
    p_usage_key: usageKey,
    p_amount: amount,
  })
  if (error) {
    return false
  }
  return data === true
}

/**
 * Enregistre une consommation d'usage (atomique côté base). Lève
 * `BillingError` (`no-subscription`, `usage-limit-exceeded`, `forbidden`…).
 */
export async function consumeUsage(
  organizationId: string,
  usageKey: string,
  amount: number,
): Promise<number> {
  const { data, error } = await (await client()).rpc("consume_usage", {
    p_organization_id: organizationId,
    p_usage_key: usageKey,
    p_amount: amount,
  })
  if (error) {
    throw mapRpcError(error)
  }
  return typeof data === "number" ? data : 0
}

/** État des limites du plan courant : limite, usage, restant. */
export async function getPlanLimitsStatus(
  organizationId: string,
): Promise<UsageStatusRow[]> {
  const { data, error } = await (await client()).rpc("plan_limits_status", {
    p_organization_id: organizationId,
  })
  if (error) {
    return []
  }
  return ((data ?? []) as UsageStatusRow[]).map((row) => ({
    limitKey: String(row.limitKey),
    limitValue: Number(row.limitValue),
    used: Number(row.used),
    remaining: Number(row.remaining),
  }))
}