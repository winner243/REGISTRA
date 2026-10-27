"use server"

import { getCurrentUser } from "@/lib/auth/session"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type UserOrganization = {
  id: string
  name: string
  role: string
}

type OrgRef = { id: string; name: string }

type MembershipRow = {
  role: string
  organizations: OrgRef | OrgRef[] | null
}

/**
 * Organisations de l'utilisateur courant (lecture seule, RLS côté base).
 *
 * S'appuie sur la matrice RLS multi-tenant : l'utilisateur ne voit QUE ses
 * appartenances (`memberships.user_id = auth.uid()`) et les organisations
 * auxquelles il a `organization.read`. Le poste de travail « proactive session
 * organisation » (cookie/sélecteur) peut appeler cette fonction : la DB reste
 * la seule source de vérité.
 */
export async function listUserOrganizations(): Promise<UserOrganization[]> {
  const user = await getCurrentUser()
  const supabase = await createSupabaseServerClient()
  if (!user || !supabase) {
    return []
  }

  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations (id, name)")
    .eq("user_id", user.id)

  if (error) {
    return []
  }

  const memberships = (data ?? []) as MembershipRow[]

  return memberships
    .flatMap((membership) => {
      const refs = Array.isArray(membership.organizations)
        ? membership.organizations
        : membership.organizations
          ? [membership.organizations]
          : []
      return refs.map(({ id, name }) => ({ id, name, role: membership.role }))
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Crée une organisation pour l'utilisateur courant.
 *
 * S'appuie exclusivement sur la base : la policy RLS `organizations_insert_own`
 * (created_by = auth.uid()) et le trigger `handle_organization_created`
 * (appartenance `owner` créée automatiquement). Aucune règle métier de limite
 * n'est appliquée ici (décision produit en attente).
 */
export async function createOrganization(
  name: string,
): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: "Connectez-vous pour créer une organisation." }
  }

  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 100) {
    return { error: "Le nom doit contenir entre 1 et 100 caractères." }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: trimmed, created_by: user.id })
    .select("id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Création de l'organisation impossible." }
  }

  return { id: data.id }
}