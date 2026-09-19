export type EmailProviderName = "dev" | "resend"

export interface EmailMessage {
  to: string
  subject: string
  html?: string
  text?: string
}

export interface EmailSendResult {
  /** Envoyé et confirmé auprès du provider lors de cet appel. */
  delivered: boolean
  /** En attente dans la file outbox (sera envoyé par le worker). */
  queued: boolean
  /** Nom du provider passé à l'envoi (dev | resend). */
  provider: string
}

export type EmailErrorCode =
  | "not-configured"
  | "provider-failure"
  | "timeout"
  | "template-error"

/** Erreur englobant un échec d'envoi. `retryable` guide les politiques de retry. */
export class EmailError extends Error {
  readonly code: EmailErrorCode
  readonly retryable: boolean

  constructor(
    code: EmailErrorCode,
    message: string,
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message)
    this.name = "EmailError"
    this.code = code
    this.retryable = options.retryable ?? false
    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}