import type { RateLimitState, RateLimitStore } from "./types"

/**
 * Store **en mémoire** (fenêtre fixe). Aucune infrastructure supplémentaire,
 * adapté au développement et à une instance unique.
 *
 * ⚠️ En déploiement serverless multi-instances, la mémoire n'est pas partagée :
 * utiliser un store distant (Redis, table Supabase…) implémentant la même
 * interface `RateLimitStore`. C'est documenté dans `docs/rate-limiting.md`.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>()
  private readonly pruneThreshold = 10_000

  consume(key: string, limit: number, windowMs: number): RateLimitState {
    const now = Date.now()
    const bucket = this.buckets.get(key)

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs })
      this.maybePrune(now)
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: 0 }
    }

    if (bucket.count < limit) {
      bucket.count += 1
      return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterMs: 0 }
    }

    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now }
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  clear(): void {
    this.buckets.clear()
  }

  /** Purge paresseuse : libère la mémoire quand la carte devient volumineuse. */
  private maybePrune(now: number): void {
    if (this.buckets.size <= this.pruneThreshold) {
      return
    }
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key)
      }
    }
  }
}