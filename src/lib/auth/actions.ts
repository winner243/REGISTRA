"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getFirstErrorMessage } from "@/lib/validation"
import { getSignUpErrorMessage } from "@/lib/auth/messages"
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/auth/schemas"
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit/guard"
import { clientIpFromHeaders } from "@/lib/rate-limit/keys"
import { rateLimitPresets } from "@/lib/rate-limit/config"

export type AuthResult = {
  error?: string
  success?: string
}

export type AuthState = AuthResult | null

/** Store des headers (compatible `next/headers`, `Headers`, etc.). */
type HeadersLike = { get(name: string): string | null | undefined }

function getBaseUrl(headerStore: HeadersLike): string {
  return headerStore.get("origin") ?? "http://localhost:3000"
}

/**
 * Rate limiting des actions auth (protection brute force), par IP.
 * Retourne un résultat d'erreur utilisateur quand la limite est dépassée,
 * sinon `null` (l'action continue).
 */
function applyAuthRateLimit(
  headerStore: HeadersLike,
  action: string
): AuthResult | null {
  const ip = clientIpFromHeaders(headerStore) ?? "unknown"
  try {
    assertRateLimit({
      key: `auth:${action}:ip:${ip}`,
      rule: rateLimitPresets.auth,
    })
    return null
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { error: error.message }
    }
    throw error
  }
}

async function getClient() {
  if (!isSupabaseConfigured()) {
    return null
  }
  return createSupabaseServerClient()
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthResult> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  })

  if (!parsed.success) {
    return { error: getFirstErrorMessage(parsed) ?? "Données invalides." }
  }

  const supabase = await getClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const headerStore = await headers()
  const limited = applyAuthRateLimit(headerStore, "login")
  if (limited) return limited

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: "Identifiants incorrects. Vérifie tes informations." }
  }

  redirect("/dashboard")
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  })

  if (!parsed.success) {
    return { error: getFirstErrorMessage(parsed) ?? "Données invalides." }
  }

  const supabase = await getClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const headerStore = await headers()
  const limited = applyAuthRateLimit(headerStore, "sign-up")
  if (limited) return limited

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: getSignUpErrorMessage(error) }
  }

  // Certains projets Supabase exigent une confirmation par email.
  // Dans ce cas, data.session est null et l'utilisateur doit valider son email.
  if (data.user && !data.session) {
    return {
      success:
        "Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse email.",
    }
  }

  redirect("/dashboard")
}

export async function forgotPassword(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: String(formData.get("email") ?? ""),
  })

  if (!parsed.success) {
    return { error: getFirstErrorMessage(parsed) ?? "Données invalides." }
  }

  const supabase = await getClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const headerStore = await headers()
  const limited = applyAuthRateLimit(headerStore, "forgot-password")
  if (limited) return limited

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getBaseUrl(headerStore)}/reset-password`,
  })

  if (error) {
    return {
      error: "Impossible d'envoyer le lien de récupération. Réessaie.",
    }
  }

  return {
    success:
      "Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé par email.",
  }
}

export async function resetPassword(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  })

  if (!parsed.success) {
    return { error: getFirstErrorMessage(parsed) ?? "Données invalides." }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const headerStore = await headers()
  const limited = applyAuthRateLimit(headerStore, "reset-password")
  if (limited) return limited

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    return { error: "Impossible de mettre à jour le mot de passe. Réessaie." }
  }

  return { success: "Mot de passe mis à jour. Tu peux te connecter." }
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  if (supabase) {
    await supabase.auth.signOut()
  }
  redirect("/login")
}
