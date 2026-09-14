/** Entrée d'erreur Supabase Auth (forme partielle du type AuthError). */
type AuthErrorInput = {
  message?: string
  code?: string
}

/**
 * Traduit une erreur `supabase.auth.signUp` en message utilisateur français.
 *
 * Ne reflète jamais le message brut (anglais, détails techniques) vers l'UI :
 * les identifiants inconnus retombent sur un message générique sûr.
 */
export function getSignUpErrorMessage(error: AuthErrorInput): string {
  const message = (error.message ?? "").toLowerCase()
  const code = (error.code ?? "").toLowerCase()

  const alreadyRegistered =
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already exists")

  if (alreadyRegistered) {
    return "Un compte existe déjà avec cette adresse email."
  }

  return "Une erreur est survenue lors de l'inscription. Réessaie."
}