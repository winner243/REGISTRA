export interface RateLimitRule {
  /** Nombre maximum de consommations autorisé dans la fenêtre. */
  limit: number
  /** Durée de la fenêtre, en millisecondes. */
  windowMs: number
  /** Message exposé lors du dépassement (optionnel). */
  message?: string
}

export type RateLimitState =
  | { allowed: true; remaining: number; retryAfterMs: 0 }
  | { allowed: false; remaining: 0; retryAfterMs: number }

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): RateLimitState
  reset(key: string): void
  clear(): void
}

export type PresetKey =
  | "api"
  | "auth"
  | "ai"
  | "upload"
  | "email"
  | "export"