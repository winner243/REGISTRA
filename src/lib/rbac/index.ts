import { getCurrentUser } from "@/lib/auth/session"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type RbacErrorCode = "unauthorized" | "forbidden"

export class RbacError extends Error {
  readonly code: RbacErrorCode

  constructor(code: RbacErrorCode, message: string) {
    super(message)
    this.name = "RbacError"
    this.code = code
  }
}

/**
 * Autorisation à l'appelant sur (organisation, permission), pilotée par la
 * base (RPC `has_permission`, security definer). Ne repose jamais sur une
 * copie locale des rôles : la base reste la source de vérité.
 */
export async function can(
  organizationId: string,
  permission: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return false
  }

  const { data, error } = await supabase.rpc("has_permission", {
    p_organization_id: organizationId,
    p_permission: permission,
  })

  return !error && data === true
}

/**
 * Exige la permission, sinon lève `RbacError`.
 * - `unauthorized` : pas d'utilisateur connecté (→ 401 / redirection login) ;
 * - `forbidden` : connecté mais sans la permission (→ 403).
 */
export async function requirePermission(
  organizationId: string,
  permission: string,
): Promise<void> {
  const user = await getCurrentUser()
  if (!user) {
    throw new RbacError("unauthorized", "Authentification requise.")
  }

  if (!(await can(organizationId, permission))) {
    throw new RbacError(
      "forbidden",
      `Permission requise : ${permission} sur l'organisation ${organizationId}.`,
    )
  }
}

/** Exige une simple appartenance (n'importe quel rôle) à l'organisation. */
export async function requireOrgMember(organizationId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) {
    throw new RbacError("unauthorized", "Authentification requise.")
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    throw new RbacError("forbidden", "Services indisponibles.")
  }

  const { data, error } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error || !data) {
    throw new RbacError(
      "forbidden",
      "Vous n'êtes pas membre de cette organisation.",
    )
  }
}

/** Rôle de l'utilisateur courant dans l'organisation (null si non membre). */
export async function getRole(
  organizationId: string,
): Promise<string | null> {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data.role ?? null
}