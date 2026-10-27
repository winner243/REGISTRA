import type { VariantProps } from "class-variance-authority"

import { badgeVariants } from "@/components/ui/badge"

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

/**
 * Libellés d'affichage pour l'espace Super Admin.
 *
 * Les valeurs codées ici correspondent aux seuls états réellement présents en
 * base (contrainte `subscriptions.status` : trialing | active | past_due |
 * canceled) et aux types REGISTRA (`organization_registra_settings`).
 * Aucun libellé n'invente une donnée qui n'existe pas.
 */

const SUBSCRIPTION_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  trialing: { label: "Essai", variant: "secondary" },
  active: { label: "Actif", variant: "default" },
  past_due: { label: "Impayé", variant: "destructive" },
  canceled: { label: "Résilié", variant: "secondary" },
}

export function subscriptionStatusLabel(status: string): string {
  return SUBSCRIPTION_STATUS[status]?.label ?? status
}

export function subscriptionStatusVariant(status: string): BadgeVariant {
  return SUBSCRIPTION_STATUS[status]?.variant ?? "outline"
}

/** Rôles réellement présents dans `role_permissions` / `memberships`. */
const ROLE_LABEL: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
}

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role
}
