import type { EmailMessage, EmailProviderName } from "@/lib/email/types"

/**
 * Contrat minimal d'un provider d'envoi. `send` ne rejette que via
 * `EmailError` (code + drapeau `retryable`) : jamais d'exception brute.
 * Le timeout et les retries sont appliqués par la couche service (résilience),
 * pas par le provider lui-même.
 */
export abstract class EmailProvider {
  abstract readonly name: EmailProviderName

  /** Envoie le message. Résout une fois accepté par le provider. */
  abstract send(message: EmailMessage): Promise<void>
}