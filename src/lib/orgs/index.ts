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