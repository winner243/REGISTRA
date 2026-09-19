import type { EmailMessage } from "@/lib/email/types"

import { EmailProvider } from "./provider"

/**
 * Provider de développement : n'envoie rien, journalise le message.
 * Actif par défaut quand `RESEND_API_KEY` n'est pas définie — permet de
 * valider les flux (rendering, file) sans frais ni e-mails réels.
 */
export class DevEmailProvider extends EmailProvider {
  readonly name = "dev"

  async send(message: EmailMessage): Promise<void> {
    console.info(`[email:dev] → ${message.to} | ${message.subject}`)
    if (message.text) {
      console.info(`[email:dev]\n${message.text}`)
    }
  }
}