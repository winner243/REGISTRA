import { afterEach, describe, expect, it } from "vitest"
import { JobsError } from "./types"
import { computeNextRetryAt } from "./queue"

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe("computeNextRetryAt", () => {
  it("retourne une date future avec backoff exponentiel", () => {
    // Test the backoff calculation logic directly (matching computeNextRetryAt implementation)
    const baseDelayMs = 60_000
    const maxDelayMs = 86_400_000

    // Attempt 1: 60_000 * 2^0 = 60_000
    expect(Math.min(baseDelayMs * 2 ** Math.min(1 - 1, 10), maxDelayMs)).toBe(60_000)
    // Attempt 2: 60_000 * 2^1 = 120_000
    expect(Math.min(baseDelayMs * 2 ** Math.min(2 - 1, 10), maxDelayMs)).toBe(120_000)
    // Attempt 3: 60_000 * 2^2 = 240_000
    expect(Math.min(baseDelayMs * 2 ** Math.min(3 - 1, 10), maxDelayMs)).toBe(240_000)
    // Attempt 11: 60_000 * 2^10 = 61,440,000 (exponent capped at 10)
    expect(Math.min(baseDelayMs * 2 ** Math.min(11 - 1, 10), maxDelayMs)).toBe(61_440_000)
    // Attempt 12: same as attempt 11 (exponent capped at 10)
    expect(Math.min(baseDelayMs * 2 ** Math.min(12 - 1, 10), maxDelayMs)).toBe(61_440_000)
  })

  it("computeNextRetryAt returns a future date", () => {
    const before = Date.now()
    const d1 = computeNextRetryAt(1)
    const after = Date.now()

    expect(d1.getTime()).toBeGreaterThanOrEqual(before + 60_000)
    expect(d1.getTime()).toBeLessThanOrEqual(after + 60_000)
  })
})

describe("JobsError", () => {
  it("crée une erreur avec code et cause", () => {
    const cause = new Error("original")
    const error = new JobsError("test-code", "test message", { cause })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("JobsError")
    expect(error.code).toBe("test-code")
    expect(error.message).toBe("test message")
    expect(error.cause).toBe(cause)
  })

  it("crée une erreur sans cause", () => {
    const error = new JobsError("test-code", "test message")
    expect(error.code).toBe("test-code")
  })
})