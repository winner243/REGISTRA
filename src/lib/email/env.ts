import type { EmailProviderName } from "@/lib/email/types"

export interface EmailEnv {
  provider: EmailProviderName
  apiKey?: string
  from: string
  fromName?: string
}

/**
 * Configuration email lue depuis les variables d'environnement.
 * Sélection du provider : `EMAIL_PROVIDER` force le choix (`dev` | `resend`) ;
 * sinon Resend est utilisé dès que `RESEND_API_KEY` est définie, sinon Dev.
 */
export function getEmailEnv(): EmailEnv {
  const force = process.env.EMAIL_PROVIDER
  const apiKey = process.env.RESEND_API_KEY
  const hasKey = Boolean(apiKey)

  const provider: EmailProviderName =
    force === "dev"
      ? "dev"
      : force === "resend"
        ? "resend"
        : hasKey
          ? "resend"
          : "dev"

  const from = process.env.EMAIL_FROM ?? (provider === "dev" ? "no-reply@localhost" : "")

  return {
    provider,
    apiKey,
    from,
    fromName: process.env.EMAIL_FROM_NAME,
  }
}

/** Vrai quand un envoi réel est possible (Dev toujours OK, Resend si clé + from). */
export function isEmailConfigured() {
  const env = getEmailEnv()
  return env.provider === "dev" || Boolean(env.apiKey && env.from)
}