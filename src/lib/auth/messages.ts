/** Entrée d'erreur Supabase Auth (forme partielle du type AuthError). */
type AuthErrorInput = {
  message?: string
  code?: string
}

/**
 * Traduit une erreur `supabase.auth.signUp` en message utilisateur français.
 *
 * Ne reflète jamais le message brut (anglais, détails techniques) vers l'UI.
 * Retourne toujours le même message pour éviter l'enumeration de comptes.
 */
export function getSignUpErrorMessage(_error: AuthErrorInput): string {
  return "Si un compte existe déjà avec cette adresse, un email de confirmation a été envoyé."
}