"use server"

/** Environnements supportés. */
export type AppEnvironment = "development" | "preview" | "production"

/** Détecte l'environnement actuel. */
export function getAppEnvironment(): AppEnvironment {
  const env = process.env.NODE_ENV
  const vercelEnv = process.env.VERCEL_ENV

  if (vercelEnv === "production") return "production"
  if (vercelEnv === "preview") return "preview"
  if (env === "production") return "production"
  if (env === "development") return "development"
  return "development"
}

/** Vrai si on est en production. */
export function isProduction(): boolean {
  return getAppEnvironment() === "production"
}

/** Vrai si on est en preview/staging. */
export function isPreview(): boolean {
  return getAppEnvironment() === "preview"
}

/** Vrai si on est en développement local. */
export function isDevelopment(): boolean {
  return getAppEnvironment() === "development"
}

/** Vrai si pas en production (dev + preview). */
export function isNonProduction(): boolean {
  return !isProduction()
}