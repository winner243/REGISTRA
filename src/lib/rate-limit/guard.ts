import { defaultRateLimiter, RateLimitError, RateLimiter } from "./limiter"
import type { RateLimitRule } from "./types"

export interface AssertRateLimitOptions {
  key: string
  rule: RateLimitRule
  limiter?: RateLimiter
}

/**
 * Porte d'entrée pour les **Server Actions** (auth, envois, générations…) :
 * lève `RateLimitError` quand la limite est dépassée — l'action l'attrape et
 * le transforme en message utilisateur sans jamais exposer le bucket interne.
 */
export function assertRateLimit(options: AssertRateLimitOptions): void {
  const limiter = options.limiter ?? defaultRateLimiter
  limiter.checkOrThrow(options.key, options.rule)
}

export { RateLimitError }