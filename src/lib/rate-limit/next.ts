import { NextResponse } from "next/server"
import { clientIp } from "./keys"
import { defaultRateLimiter, RateLimiter } from "./limiter"
import type { RateLimitRule, RateLimitState } from "./types"

export interface ProtectOptions {
  /** Clé de quota (ex. `buildRateLimitKey(prefix, userId, request)`). */
  key: string
  rule: RateLimitRule
  limiter?: RateLimiter
}

/**
 * Consomme une unité du quota et retourne :
 * - `null` si la requête est autorisée ;
 * - une `Response` `429` sinon (headers `Retry-After` + `X-RateLimit-*`).
 */
export function protect(
  options: ProtectOptions,
): NextResponse | null {
  const limiter = options.limiter ?? defaultRateLimiter
  const state = limiter.check(options.key, options.rule)
  return state.allowed ? null : rateLimitResponse(state, options.rule)
}

/** Clé de quota dérivée d'une requête (userId prioritaire, sinon IP). */
export function protectRequest(
  request: Request,
  options: Omit<ProtectOptions, "key"> & { prefix: string; userId?: string | null },
): NextResponse | null {
  const key = options.userId
    ? `${options.prefix}:user:${options.userId}`
    : `${options.prefix}:ip:${clientIp(request) ?? "unknown"}`
  return protect({ ...options, key })
}

/** Réponse `429 Too Many Requests` avec headers standards de rate limiting. */
export function rateLimitResponse(
  state: RateLimitState,
  rule: RateLimitRule,
): NextResponse {
  const retryAfterSeconds = state.allowed
    ? 0
    : Math.ceil(state.retryAfterMs / 1000)

  return NextResponse.json(
    {
      error: rule.message ?? "Trop de requêtes. Réessaie plus tard.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(rule.limit),
        "X-RateLimit-Remaining": String(state.remaining),
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + state.retryAfterMs) / 1000)),
      },
    },
  )
}