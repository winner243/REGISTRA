import { afterEach, describe, expect, it, vi } from "vitest"

import { RetryError, retry, TimeoutError, withTimeout } from "./index"

afterEach(() => {
  vi.useRealTimers()
})

describe("withTimeout", () => {
  it("résout quand la promesse termine à temps", async () => {
    await expect(withTimeout(Promise.resolve(42), 100)).resolves.toBe(42)
  })

  it("rejette avec TimeoutError quand la promesse est trop lente", async () => {
    vi.useFakeTimers()
    const slow = new Promise<string>(() => {})
    const promise = withTimeout(slow, 100)

    const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(101)
    await assertion
  })

  it("propage l'erreur de la promesse d'origine avant le timeout", async () => {
    const failing = Promise.reject(new Error("boom"))
    await expect(withTimeout(failing, 1000)).rejects.toThrow("boom")
  })

  it("rejette les délais invalides de façon synchrone", () => {
    expect(() => withTimeout(Promise.resolve(1), 0)).toThrowError(TypeError)
    expect(() => withTimeout(Promise.resolve(1), -5)).toThrowError(TypeError)
    expect(() => withTimeout(Promise.resolve(1), Number.NaN)).toThrowError(TypeError)
  })
})

describe("retry", () => {
  it("réussit à la première tentative", async () => {
    const fn = vi.fn(async () => "ok")
    const result = await retry(fn, { attempts: 3 })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("réessaie puis réussit", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok")
    const result = await retry(fn, { attempts: 3, baseDelayMs: 1 })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("épuise les tentatives puis lève RetryError avec la dernière cause", async () => {
    const cause = new Error("persistent")
    const fn = vi.fn().mockRejectedValue(cause)
    const promise = retry(fn, { attempts: 3, baseDelayMs: 0 })

    await expect(promise).rejects.toBeInstanceOf(RetryError)
    await promise.catch((error: unknown) => {
      expect(error).toBeInstanceOf(RetryError)
      if (error instanceof RetryError) {
        expect(error.cause).toBe(cause)
        expect(error.attempts).toBe(3)
      }
    })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("respecte retryIf : pas de retry sur erreur non temporaire", async () => {
    const error = new Error("validation")
    const fn = vi.fn().mockRejectedValue(error)
    const retryIf = vi.fn((err: unknown) => !(err instanceof Error && err.message === "validation"))

    await expect(retry(fn, { attempts: 3, retryIf })).rejects.toBeInstanceOf(RetryError)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(retryIf).toHaveBeenCalledWith(error, 1)
  })

  it("retryIf peut fonder la décision sur la numéro de tentative", async () => {
    const fn = vi.fn().mockImplementation(async (): Promise<string> => {
      throw new Error("hard")
    })
    const retryIf = vi.fn((_err: unknown, attempt: number) => attempt === 1)

    await expect(retry(fn, { attempts: 3, baseDelayMs: 0, retryIf })).rejects.toBeInstanceOf(RetryError)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("applique un backoff exponentiel plafonné", async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("e"))
      .mockRejectedValueOnce(new Error("e"))
      .mockRejectedValueOnce(new Error("e"))
      .mockResolvedValueOnce("ok")

    const promise = retry(fn, {
      attempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 300,
      backoff: "exponential",
    })

    // 100 + 200 + 300 = 600ms au total, largement sous 10s.
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(promise).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it("refuse de lancer quand le signal est déjà abandonné", async () => {
    const controller = new AbortController()
    controller.abort()
    const fn = vi.fn().mockRejectedValue(new Error("e"))

    await expect(
      retry(fn, { attempts: 3, signal: controller.signal }),
    ).rejects.toThrowError("annulée")
    expect(fn).not.toHaveBeenCalled()
  })

  it("arrête l'attente entre tentatives à l'abandon du signal", async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockRejectedValue(new Error("e"))

    const promise = retry(fn, {
      attempts: 3,
      baseDelayMs: 10_000,
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(promise).rejects.toThrowError("annulée")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("valide ses options", () => {
    void expect(retry(async () => "x", { attempts: 0 })).rejects.toThrowError(TypeError)
    void expect(retry(async () => "x", { attempts: 1, baseDelayMs: -1 })).rejects.toThrowError(TypeError)
  })
})