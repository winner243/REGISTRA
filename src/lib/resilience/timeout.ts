export class TimeoutError extends Error {
  readonly ms: number

  constructor(ms: number, message?: string) {
    super(message ?? `L'opération a dépassé le délai de ${ms}ms.`)
    this.name = "TimeoutError"
    this.ms = ms
  }
}

/**
 * Borde un appel asynchrone par un délai strictement positif.
 *
 * Règle de résilience : aucun appel externe potentiellement lent ne doit
 * pouvoir bloquer indéfiniment une requête. Place `promise` déjà créée en
 * argument — jamais une fabrique — pour ne pas lancer le travail en double.
 * La promesse initiale n'est pas annulée (résolution silencieuse) : `AbortSignal`
 * reste le mécanisme à préférer quand le provider le supporte.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string,
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new TypeError("withTimeout: `ms` doit être un nombre strictement positif.")
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(ms, message))
    }, ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}