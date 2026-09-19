import { getEmailEnv } from "@/lib/email/env"

import { DevEmailProvider } from "./dev"
import { EmailProvider } from "./provider"
import { ResendEmailProvider } from "./resend"

export { EmailProvider } from "./provider"
export { DevEmailProvider } from "./dev"
export { ResendEmailProvider } from "./resend"

/**
 * Provider par défaut selon l'environnement. Construit à la volée : les tests
 * et le mode dégradé passent par un provider injecté, jamais par ce sélecteur.
 */
export function getDefaultEmailProvider(): EmailProvider {
  const env = getEmailEnv()
  return env.provider === "resend"
    ? new ResendEmailProvider(env.from, env.fromName)
    : new DevEmailProvider()
}