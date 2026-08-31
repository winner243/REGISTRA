"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type AuthResult = {
  error?: string
  success?: string
}

export type AuthState = AuthResult | null

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

async function getBaseUrl(): Promise<string> {
  const headerStore = await headers()
  return headerStore.get("origin") ?? "http://localhost:3000"
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!email || !isValidEmail(email)) {
    return { error: "Adresse email invalide." }
  }
  if (!password) {
    return { error: "Le mot de passe est requis." }
  }

  const supabase = await getClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!email || !isValidEmail(email)) {
    return { error: "Adresse email invalide." }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    }
  }
  if (password !== confirmPassword) {
    return { error: "Les mots de passe ne correspondent pas." }
  }

  const supabase = await getClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return {
      error:
        error.message === "User already registered"
          ? "Un compte existe déjà avec cette adresse email."
          : error.message,
    }
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase()

  if (!email || !isValidEmail(email)) {
    return { error: "Adresse email invalide." }
  }

  const supabase = await getClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getBaseUrl()}/reset-password`,
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
  const password = String(formData.get("password") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    }
  }
  if (password !== confirmPassword) {
    return { error: "Les mots de passe ne correspondent pas." }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: "Supabase n'est pas configuré sur ce projet." }
  }

  const { error } = await supabase.auth.updateUser({ password })

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
