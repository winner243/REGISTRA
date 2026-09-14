import { MemoryRateLimitStore } from "./store"
import type { RateLimitRule, RateLimitState, RateLimitStore } from "./types"

/** Erreur de dépassement de limite. Sert aux Server Actions. */
export class RateLimitError extends Error {
  readonly key: string
  readonly retryAfterMs: number
  readonly limit: number
  readonly windowMs: number

  constructor(key: string, rule: RateLimitRule, retryAfterMs: number) {
    super(rule.message ?? "Trop de requêtes. Réessaie plus tard.")
    this.name = "RateLimitError"
    this.key = key
    this.retryAfterMs = retryAfterMs
    this.limit = rule.limit
    this.windowMs = rule.windowMs
  }
}

/**
 * Limiteur de fenêtre fixe reposant sur un `RateLimitStore`.
 * Utilisable dans les Route Handlers et les Server Actions.
 */
export class RateLimiter {
  constructor(private readonly store: RateLimitStore) {}

  /** Consomme une unité du quota et retourne l'état résultant. */
  check(key: string, rule: RateLimitRule): RateLimitState {
    assertValidRule(rule)
    return this.store.consume(key, rule.limit, rule.windowMs)
  }

  /** Consomme une unité ; lève `RateLimitError` en cas de dépassement. */
  checkOrThrow(key: string, rule: RateLimitRule): void {
    const state = this.check(key, rule)
    if (!state.allowed) {
      throw new RateLimitError(key, rule, state.retryAfterMs)
    }
  }

  reset(key: string): void {
    this.store.reset(key)
  }

  /** Vide tout le store. Utile pour les tests et le reset global. */
  clear(): void {
    this.store.clear()
  }
}

function assertValidRule(rule: RateLimitRule): void {
  if (!Number.isInteger(rule.limit) || rule.limit <= 0) {
    throw new Error(`Limite invalide (${rule.limit}) : positif requis.`)
  }
  if (!Number.isInteger(rule.windowMs) || rule.windowMs <= 0) {
    throw new Error(`Fenêtre invalide (${rule.windowMs} ms) : positive requise.`)
  }
}

/** Instance partagée par défaut du process (mémoire). */
export const defaultRateLimiter = new RateLimiter(new MemoryRateLimitStore())