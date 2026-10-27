/**
 * Server Actions du Super Admin — écritures privilégiées du panneau.
 *
 * Chaque action :
 *   1. valide ses entrées côté serveur (les données client ne sont pas fiables) ;
 *   2. délègue au service, qui revérifie `app_metadata.platform_admin === true`
 *      **pour l'opération**, puis utilise le client `service_role` privé ;
 *   3. renvoie une erreur explicite plutôt qu'un succès simulé.
 *
 * Il n'existe qu'une seule écriture privilégiée : modifier le nom et le type
 * d'un établissement. Elle est indispensable car RLS refuse tout accès à un
 * Super Admin sans appartenance (`has_permission(..., 'organization.update')`).
 *
 * La CRÉATION n'est pas ici : elle est un pouvoir normal de tout utilisateur
 * connecté, déjà couvert par `CreateOrganizationForm` →
 * `createRegistraOrganization` sous RLS. Le panneau réutilise cette voie
 * plutôt que d'en créer une seconde.
 *
 * Le fait qu'un Server Action soit « routable » par n'importe quel client ne
 * donne rien : sans le claim de plateforme, `requirePlatformAdmin()` refuse
 * (testé dans `service.test.ts`).
 */

"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  ORGANIZATION_NAME_MAX,
  ORGANIZATION_NAME_MIN,
  PlatformAdminError,
  updatePlatformOrganization,
} from "@/lib/platform-admin/service"
import { ORG_TYPES } from "@/lib/registra/vocab"

/** État renvoyé au formulaire — jamais de message de succès fictif. */
export type AdminActionState = {
  ok: boolean
  message: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const nameSchema = z
  .string()
  .min(ORGANIZATION_NAME_MIN, `Minimum ${ORGANIZATION_NAME_MIN} caractères.`)
  .max(ORGANIZATION_NAME_MAX, `Maximum ${ORGANIZATION_NAME_MAX} caractères.`)

function toOrgType(value: FormDataEntryValue | null): string | undefined {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return undefined
  return ORG_TYPES.find((t) => t.value === raw)?.value
}

/**
 * Modifie un établissement depuis l'espace Super Admin.
 *
 * `organizationType` est facultatif : omis ou vide → seul le nom est écrit,
 * les réglages REGISTRA restent intacts (aucune ligne n'est créée à l'aveugle).
 *
 * Expose uniquement le message d'erreur : ni la stack trace, ni le détail
 * Postgres ne partent vers le navigateur.
 */
export async function updateOrganizationAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const rawId = formData.get("organizationId")
  const rawName = formData.get("name")
  const rawType = formData.get("organizationType")

  const id = typeof rawId === "string" ? rawId.trim() : ""
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, message: "Identifiant d'établissement invalide." }
  }

  const name = typeof rawName === "string" ? rawName.trim() : ""
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Nom d'établissement invalide.",
    }
  }

  // Un type renseigné mais non reconnu est un refus, jamais un repli silencieux.
  const rawTypeValue = typeof rawType === "string" ? rawType.trim() : ""
  const organizationType = rawTypeValue ? toOrgType(rawType) : undefined
  if (rawTypeValue && !organizationType) {
    return { ok: false, message: "Type d'établissement invalide." }
  }

  try {
    await updatePlatformOrganization({
      id,
      name: parsed.data,
      ...(organizationType ? { organizationType } : {}),
    })
  } catch (error) {
    if (error instanceof PlatformAdminError) {
      return { ok: false, message: error.message }
    }
    // Redirection d'authentification et erreurs inattendues.
    throw error
  }

  revalidatePath("/admin/organizations")

  return { ok: true, message: "Établissement mis à jour." }
}
