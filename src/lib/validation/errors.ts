import type { ZodError } from "zod"

type SafeParseResult = { success: true } | { success: false; error: ZodError }

/**
 * Retourne le premier message d'erreur d'un résultat Zod, si le parsing a
 * échoué. Permet d'afficher une erreur utilisateur compréhensible côté
 * serveur sans exposer de détails techniques.
 */
export function getFirstErrorMessage(result: SafeParseResult): string | null {
  if (result.success) {
    return null
  }
  return result.error.issues[0]?.message ?? "Données invalides."
}
