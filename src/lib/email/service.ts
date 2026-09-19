import { RetryError, retry } from "@/lib/resilience"
import { withTimeout } from "@/lib/resilience"
import type { EmailMessage, EmailProviderName, EmailSendResult } from "@/lib/email/types"
import { EmailError } from "@/lib/email/types"
import { SupabaseOutbox, type OutboxClient } from "@/lib/email/outbox"
import { getDefaultEmailProvider, type EmailProvider } from "@/lib/email/providers"
import { emailTemplates, type EmailTemplateName, type TemplateData } from "@/lib/email/templates"

export interface DeliveryConfig {
  sendTimeoutMs?: number
  sendAttempts?: number
}

/**
 * Envoie un message via le provider, protégé par timeout + retries à backoff
 * exponentiel. Ne retente QUE les erreurs transitoires (`retryable` ou non
 * `EmailError`, ex. timeout réseau) ; les erreurs définitives (4xx…) stoppent.
 */
export async function deliverMessage(
  provider: EmailProvider,
  message: EmailMessage,
  config: DeliveryConfig = {},
): Promise<void> {
  const sendTimeoutMs = config.sendTimeoutMs ?? 10_000
  const sendAttempts = config.sendAttempts ?? 3

  await retry(
    () =>
      withTimeout(
        provider.send(message),
        sendTimeoutMs,
        `Envoi d'email dépassé ${sendTimeoutMs}ms par le provider ${provider.name}.`,
      ),
    {
      attempts: sendAttempts,
      baseDelayMs: 250,
      maxDelayMs: 2_000,
      backoff: "exponential",
      jitter: true,
      retryIf: (error) => !(error instanceof EmailError) || error.retryable,
    },
  )
}

/** Message d'erreur lisible depuis une chaîne d'erreurs (RetryError → cause). */
export function describeEmailError(error: unknown): string {
  const cause = error instanceof RetryError ? error.cause : error
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause ?? error)
}

export interface EmailServiceOptions extends DeliveryConfig {
  provider?: EmailProvider
  outbox?: OutboxClient
}

/**
 * Service email : rend le template, persiste l'email dans la file outbox
 * (durable + idempotente) puis tente immédiatement l'envoi.
 *
 * Un email est TOUJOURS à traiter comme une opération secondaire : envoyé
 * dans `after()` côté App Router, son échec ne doit jamais casser l'action
 * principale. Cette méthode retourne donc toujours un résultat, jamais une
 * exception — sauf erreur de programmation (template inconnu).
 */
export class EmailService {
  private readonly provider: EmailProvider
  private readonly outbox: OutboxClient
  private readonly sendTimeoutMs: number
  private readonly sendAttempts: number

  constructor(options: EmailServiceOptions = {}) {
    this.provider = options.provider ?? getDefaultEmailProvider()
    this.outbox = options.outbox ?? new SupabaseOutbox()
    this.sendTimeoutMs = options.sendTimeoutMs ?? 10_000
    this.sendAttempts = options.sendAttempts ?? 3
  }

  get providerName(): EmailProviderName {
    return this.provider.name
  }

  async send<N extends EmailTemplateName>(
    name: N,
    data: TemplateData<N>,
  ): Promise<EmailSendResult> {
    const render = emailTemplates[name]
    if (!render) {
      throw new EmailError(
        "template-error",
        `Template d'email inconnu : ${String(name)}.`,
      )
    }

    const rendered = render(data)
    const message: EmailMessage = {
      to: data.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }

    if (!this.outbox.isAvailable()) {
      // Pas de file persistante : envoi direct best-effort (ex. dev local).
      return this.sendWithoutOutbox(message)
    }

    let id: string | null
    try {
      id = await this.outbox.queue({
        type: name,
        referenceId: data.referenceId,
        recipient: data.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        payload: {},
      })
    } catch (error) {
      // Outbox indisponible (DB down) : repli en envoi direct, pas de perte.
      console.error(`[email] mise en file échouée (${name}):`, error)
      return this.sendWithoutOutbox(message)
    }

    if (id === null) {
      // (type, reference_id) déjà en file : le worker s'en charge, pas de doublon.
      return {
        delivered: false,
        queued: true,
        provider: this.providerName,
      }
    }

    try {
      await deliverMessage(this.provider, message, {
        sendTimeoutMs: this.sendTimeoutMs,
        sendAttempts: this.sendAttempts,
      })
      await this.outbox.markSent(id)
      return { delivered: true, queued: false, provider: this.providerName }
    } catch (error) {
      // Échec après retries : la ligne reste en file pour le worker (backoff).
      try {
        await this.outbox.markFailed(
          id,
          describeEmailError(error),
          this.sendAttempts,
        )
      } catch (markError) {
        console.error("[email] marquage échec impossible:", markError)
      }
      return { delivered: false, queued: true, provider: this.providerName }
    }
  }

  private async sendWithoutOutbox(message: EmailMessage): Promise<EmailSendResult> {
    try {
      await deliverMessage(this.provider, message, {
        sendTimeoutMs: this.sendTimeoutMs,
        sendAttempts: this.sendAttempts,
      })
      return { delivered: true, queued: false, provider: this.providerName }
    } catch (error) {
      console.error("[email] envoi impossible (aucune file) :", error)
      return { delivered: false, queued: false, provider: this.providerName }
    }
  }
}

/** Instance partagée (provider et outbox résolus depuis l'environnement). */
export const emailService = new EmailService()