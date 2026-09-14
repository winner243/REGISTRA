import { afterEach, describe, expect, it, vi } from "vitest"

import {
  assertRateLimit,
  buildRateLimitKey,
  clientIp,
  defaultRateLimiter,
  MemoryRateLimitStore,
  rateLimitPresets,
  RateLimiter,
  RateLimitError,
} from "./index"

afterEach(() => {
  vi.useRealTimers()
  defaultRateLimiter.reset("test")
})

describe("RateLimiter (fenêtre fixe, mémoire)", () => {
  it("autorise les requêtes sous la limite puis refuse au dépassement", () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore())
    const rule = { limit: 3, windowMs: 60_000 }

    expect(limiter.check("k", rule)).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 })
    expect(limiter.check("k", rule)).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 })
    expect(limiter.check("k", rule)).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 })

    const blocked = limiter.check("k", rule)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0)
    }
  })

  it("réinitialise la fenêtre après son expiration", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

    const limiter = new RateLimiter(new MemoryRateLimitStore())
    const rule = { limit: 1, windowMs: 60_000 }

    expect(limiter.check("k", rule).allowed).toBe(true)
    expect(limiter.check("k", rule).allowed).toBe(false)

    vi.advanceTimersByTime(60_001)

    expect(limiter.check("k", rule).allowed).toBe(true)
  })

  it("isole les clés (buckets indépendants)", () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore())
    const rule = { limit: 1, windowMs: 60_000 }

    limiter.check("a", rule)
    expect(limiter.check("b", rule).allowed).toBe(true)
    expect(limiter.check("a", rule).allowed).toBe(false)
  })

  it("reset() et clear() vident les buckets", () => {
    const store = new MemoryRateLimitStore()
    const limiter = new RateLimiter(store)
    const rule = { limit: 1, windowMs: 60_000 }

    limiter.check("a", rule)
    limiter.reset("a")
    expect(limiter.check("a", rule).allowed).toBe(true)

    limiter.check("b", rule)
    limiter.check("c", rule)
    store.clear()
    expect(limiter.check("b", rule).allowed).toBe(true)
    expect(limiter.check("c", rule).allowed).toBe(true)
  })

  it("checkOrThrow lève RateLimitError avec retryAfterMs", () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore())
    const rule = { limit: 1, windowMs: 60_000 }

    limiter.checkOrThrow("k", rule)

    expect(() => limiter.checkOrThrow("k", rule)).toThrowError(RateLimitError)
    try {
      limiter.checkOrThrow("k", rule)
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError)
      if (error instanceof RateLimitError) {
        expect(error.retryAfterMs).toBeGreaterThan(0)
        expect(error.key).toBe("k")
      }
    }
  })

  it("rejette les règles invalides au moment de la vérification", () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore())
    expect(() => limiter.check("k", { limit: 0, windowMs: 1000 })).toThrowError()
    expect(() => limiter.check("k", { limit: 10, windowMs: -5 })).toThrowError()
  })
})

describe("assertRateLimit", () => {
  it("autorise puis lève en cas de dépassement", () => {
    assertRateLimit({ key: "test", rule: { limit: 1, windowMs: 60_000 } })
    expect(() =>
      assertRateLimit({ key: "test", rule: { limit: 1, windowMs: 60_000 } }),
    ).toThrowError(RateLimitError)
  })
})

describe("clientIp / buildRateLimitKey", () => {
  it("extrait la première adresse de x-forwarded-for", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    })
    expect(clientIp(request)).toBe("1.2.3.4")
  })

  it("priorise l'identité utilisateur sur l'IP", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    })
    const key = buildRateLimitKey("auth", "user-42", request)
    expect(key).toBe("auth:user:user-42")
    expect(buildRateLimitKey("auth", "user-42")).toBe("auth:user:user-42")
  })

  it("retombe sur l'IP puis sur unknown", () => {
    expect(
      buildRateLimitKey("api", null, new Request("https://example.com", {
        headers: { "x-real-ip": "5.6.7.8" },
      })),
    ).toBe("api:ip:5.6.7.8")

    expect(buildRateLimitKey("api", null)).toBe("api:ip:unknown")
  })
})

describe("rateLimitPresets", () => {
  it("définit des limites et fenêtres cohérentes", () => {
    for (const preset of Object.values(rateLimitPresets)) {
      expect(preset.limit).toBeGreaterThan(0)
      expect(preset.windowMs).toBeGreaterThan(0)
    }
  })
})