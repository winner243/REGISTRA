export type RetryBackoff = "fixed" | "exponential"

export type RetryErrorPredicate = (error: unknown, attempt: number) => boolean

export interface RetryOptions {
  /** Nombre total de tentatives (>= 1). */
  attempts: number
  /** Délai de base avant la première retry, en millisecondes. */
  baseDelayMs?: number
  /** Plafond du délai (backoff exponentiel), en millisecondes. */
  maxDelayMs?: number
  /** "fixed" : délai constant ; "exponential" : base * 2^(tentative-1) plafonné. */
  backoff?: RetryBackoff
  /** Ajoute une dispersion aléatoire (~50 %) pour éviter l'effet de meute. */
  jitter?: boolean
  /**
   * Décide si une erreur mérite une nouvelle tentative (les temporaires :
   * timeouts, 5xx, pannes réseau…). Quand absente, toutes les erreurs sont
   * retentées — à n'utiliser que sur des opérations IDEMPOTENTES.
   */
  retryIf?: RetryErrorPredicate
  /** Annule l'attente entre tentatives (ne coupe pas l'opération en cours). */
  signal?: AbortSignal
}

/** Erreur finale après épuisement des tentatives. Porte la dernière cause. */
export class RetryError extends Error {
  readonly attempts: number
  readonly cause: unknown

  constructor(cause: unknown, attempts: number) {
    super(`L'opération a échoué après ${attempts} tentative(s).`)
    this.name = "RetryError"
    this.cause = cause
    this.attempts = attempts
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("L'opération a été annulée.", "AbortError"))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new DOMException("L'opération a été annulée.", "AbortError"))
      },
      { once: true },
    )
  })
}

/**
 * Exécute `fn` avec retry + backoff. Les retries sont faites UNIQUEMENT sur
 * des erreurs temporaires et/ou des opérations idempotentes : un retry
 * aveugle d'une opération non idempotente (paiement, création…) peut dupliquer
 * un effet secondaire. C'est à l'appelant de fournir `retryIf` en conséquence.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { attempts, signal } = options
  const baseDelayMs = options.baseDelayMs ?? 0
  const maxDelayMs = options.maxDelayMs ?? baseDelayMs
  const backoff = options.backoff ?? "fixed"
  const jitter = options.jitter ?? false

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new TypeError("retry: `attempts` doit être un entier >= 1.")
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new TypeError("retry: `baseDelayMs` doit être >= 0.")
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("L'opération a été annulée.", "AbortError")
    }

    try {
      return await fn()
    } catch (error) {
      lastError = error

      const retryable = options.retryIf
        ? options.retryIf(error, attempt)
        : true

      if (!retryable || attempt === attempts) {
        throw new RetryError(error, attempt)
      }
    }

    const base = backoff === "exponential" ? Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs) : baseDelayMs
    const delay = jitter ? base * (0.5 + Math.random() * 0.5) : base
    await sleep(delay, signal)
  }

  throw new RetryError(lastError, attempts)
}