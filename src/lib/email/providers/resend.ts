import { Resend, type CreateEmailOptions } from "resend"

import { EmailError, type EmailMessage } from "@/lib/email/types"

import { EmailProvider } from "./provider"

function parseStatus(error: unknown): number | undefined {
  return (error as { statusCode?: number }).statusCode
}

/**
 * Provider Resend (API réaliste par défaut). Le mail est accepté mais pas
 * nécessairement délivré : côté Resend, la délivrabilité (bounces, spam…)
 * est suivie via webhooks, hors périmètre de la file outbox.
 */
export class ResendEmailProvider extends EmailProvider {
  readonly name = "resend"

  private readonly client: Resend
  private readonly from: string

  constructor(from: string, fromName?: string) {
    super()
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new EmailError(
        "not-configured",
        "Resend est sélectionné mais RESEND_API_KEY n'est pas définie.",
      )
    }
    if (!from) {
      throw new EmailError(
        "not-configured",
        "Resend est sélectionné mais EMAIL_FROM n'est pas définie.",
      )
    }
    this.client = new Resend(apiKey)
    this.from = fromName ? `${fromName} <${from}>` : from
  }

  async send(message: EmailMessage): Promise<void> {
    const payload: CreateEmailOptions = {
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html ?? "",
      ...(message.text !== undefined ? { text: message.text } : {}),
    }

    try {
      const { error } = await this.client.emails.send(payload)

      if (error) {
        throw error
      }
    } catch (error) {
      if (error instanceof EmailError) {
        throw error
      }

      // Pas de statut (erreur réseau, SDK) → transitoire.
      const status = parseStatus(error)
      if (status === undefined) {
        throw new EmailError(
          "provider-failure",
          "Resend : échec réseau lors de l'envoi.",
          { cause: error, retryable: true },
        )
      }

      // 429 (limite de débit) et 5xx (indisponibilité) : transitoires.
      const message =
        (error as { message?: string }).message ?? `Resend : erreur ${status}.`
      const retryable = status === 429 || status >= 500

      throw new EmailError(
        "provider-failure",
        `Resend : ${message}`,
        { cause: error, retryable },
      )
    }
  }
}