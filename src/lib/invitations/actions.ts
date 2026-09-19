"use server"

import { headers } from "next/headers"
import { after } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { emailService } from "@/lib/email"
import { RbacError, requirePermission } from "@/lib/rbac"
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit/guard"
import { rateLimitPresets } from "@/lib/rate-limit/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getBaseUrlFromHeaders } from "@/lib/url"
import { getFirstErrorMessage } from "@/lib/validation"

import { mapInvitationError } from "./messages"
import { inviteSchema, revokeInvitationSchema } from "./schemas"

export type InvitationActionState = {
  error?: string
  success?: string
} | null

function rateLimited(userId: string): string | null {
  try {
    assertRateLimit({
      key: `invite:user:${userId}`,
      rule: rateLimitPresets.email,
    })
    return null
  } catch (error) {
    if (error instanceof RateLimitError) {
      return error.message
    }
    throw error
  }
}

function deniedMessage(error: unknown): string | null {
  if (!(error instanceof RbacError)) {
    return null
  }
  return error.code === "unauthorized"
    ? "Connectez-vous pour gérer les membres."
    : "Vous n'avez pas la permission de gérer les membres de cette organisation."
}

async function organizationName(
  organizationId: string,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  return data.name ?? null
}

/**
 * Crée une invitation et envoie l'email APRÈS la réponse (`after()`).
 * L'action principale réussit même si l'envoi échoue : la file outbox — ou le
 * worker email — garantit la remise (ou une retry via `next_attempt_at`).
 */
export async function inviteMember(
  _prevState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = inviteSchema.safeParse({
    organizationId: String(formData.get("organizationId") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  })

  if (!parsed.success) {
    return { error: getFirstErrorMessage(parsed) ?? "Données invalides." }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { error: "Connectez-vous pour inviter des membres." }
  }

  const limited = rateLimited(user.id)
  if (limited) {
    return { error: limited }
  }

  try {
    await requirePermission(parsed.data.organizationId, "members.invite")
  } catch (error) {
    const denied = deniedMessage(error)
    if (denied) {
      return { error: denied }
    }
    throw error
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { data: token, error } = await supabase.rpc("create_invitation", {
    p_organization_id: parsed.data.organizationId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  })

  if (error || typeof token !== "string") {
    return {
      error:
        mapInvitationError(error) ??
        "Impossible de créer l'invitation. Réessayez.",
    }
  }

  const headerStore = await headers()
  const origin = getBaseUrlFromHeaders(headerStore)
  const acceptUrl = `${origin}/invitations/accept?token=${encodeURIComponent(token)}`

  after(async () => {
    await emailService.send("invitation", {
      to: parsed.data.email,
      // Clé d'idempotence : le token est unique par invitation.
      referenceId: token,
      organizationName:
        (await organizationName(parsed.data.organizationId)) ?? "l'organisation",
      role: parsed.data.role,
      acceptUrl,
    })
  })

  return {
    success: `Invitation envoyée à ${parsed.data.email}.`,
  }
}

/** Révoque une invitation en attente. */
export async function revokeInvitation(
  _prevState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = revokeInvitationSchema.safeParse({
    organizationId: String(formData.get("organizationId") ?? ""),
    invitationId: String(formData.get("invitationId") ?? ""),
  })

  if (!parsed.success) {
    return { error: getFirstErrorMessage(parsed) ?? "Données invalides." }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { error: "Connectez-vous pour gérer les membres." }
  }

  try {
    await requirePermission(parsed.data.organizationId, "members.invite")
  } catch (error) {
    const denied = deniedMessage(error)
    if (denied) {
      return { error: denied }
    }
    throw error
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { data: revoked, error } = await supabase.rpc("revoke_invitation", {
    p_invitation_id: parsed.data.invitationId,
  })

  if (error) {
    return {
      error:
        mapInvitationError(error) ??
        "Impossible de révoquer l'invitation. Réessayez.",
    }
  }

  return revoked === true
    ? { success: "Invitation révoquée." }
    : { error: "Invitation introuvable ou déjà traitée." }
}

/**
 * Accepte une invitation via son token. À appeler uniquement côté serveur
 * (Server Component) : crée l'appartenance et retourne l'id de l'organisation.
 */
export async function acceptInvitation(
  token: string,
): Promise<{ organizationId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  })

  if (error || typeof data !== "string") {
    return {
      error:
        mapInvitationError(error) ??
        "Impossible d'accepter l'invitation. Réessayez.",
    }
  }

  return { organizationId: data }
}