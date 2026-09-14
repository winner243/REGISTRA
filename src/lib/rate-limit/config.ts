import type { PresetKey, RateLimitRule } from "./types"

/**
 * Limites de départ, **configurables d'endpoint en endpoint**. Ce sont des
 * points de départ raisonnables, PAS des règles universelles : chaque SaaS
 * ajuste la valeur de la limite et de la fenêtre selon son trafic, son coût
 * métier et son modèle économique. Aucune valeur ne doit être adoptée sans
 * réflexion.
 */
export const rateLimitPresets = {
  /** API générale (endpoints standard). */
  api: { limit: 300, windowMs: 60_000 },
  /** Connexion / inscription (protection brute force, par IP ou utilisateur). */
  auth: { limit: 10, windowMs: 60_000 },
  /** Génération assistée par IA (endpoints coûteux). */
  ai: { limit: 20, windowMs: 60_000 },
  /** Uploads de fichiers. */
  upload: { limit: 10, windowMs: 60_000 },
  /** Emails sortants (réinitialisation de mot de passe, invitations…). */
  email: { limit: 10, windowMs: 60_000 },
  /** Exports de données (volumétrie + coût de génération). */
  export: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<PresetKey, RateLimitRule>

export type RateLimitPreset = (typeof rateLimitPresets)[PresetKey]