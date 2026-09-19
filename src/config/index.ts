import { z } from "zod"
import { getAppEnvironment } from "./environment"
export { getAppEnvironment } from "./environment"
export type { AppEnvironment } from "./environment"

/** Schéma de configuration centralisée — validé au startup. */
export const configSchema = z.object({
  /** Environnement d'exécution. */
  environment: z.enum(["development", "preview", "production"]),

  /** Branding de l'application. */
  app: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(300).optional(),
    tagline: z.string().max(200).optional(),
    url: z.string().url(),
    logo: z.object({
      src: z.string().min(1),
      alt: z.string().min(1),
    }).optional(),
    favicon: z.string().optional(),
  }),

  /** Configuration auth. */
  auth: z.object({
    /** Durée de session (secondes). */
    sessionDuration: z.number().int().positive().default(3600),
    /** Activer l'inscription. */
    enableSignup: z.boolean().default(true),
    /** Activer la confirmation email. */
    enableEmailConfirmation: z.boolean().default(true),
    /** Redirection après login. */
    loginRedirect: z.string().default("/dashboard"),
    /** Redirection après inscription. */
    signupRedirect: z.string().default("/dashboard"),
  }),

  /** Configuration email. */
  email: z.object({
    /** Provider : "dev" | "resend". */
    provider: z.enum(["dev", "resend"]),
    /** Clé API Resend (requis si provider=resend). */
    apiKey: z.string().optional(),
    /** Expéditeur (from). */
    from: z.string().min(1),
    /** Nom expéditeur. */
    fromName: z.string().max(100).optional(),
    /** Timeout d'envoi (ms). */
    sendTimeoutMs: z.number().int().positive().default(10_000),
    /** Tentatives d'envoi. */
    sendAttempts: z.number().int().positive().default(3),
  }),

  /** Configuration Supabase. */
  supabase: z.object({
    /** URL du projet. */
    url: z.string().url(),
    /** Clé publishable (publique). */
    publishableKey: z.string().min(1),
    /** Clé service_role (secrète, serveur uniquement). */
    serviceRoleKey: z.string().optional(),
  }),

  /** Configuration rate limiting. */
  rateLimit: z.object({
    /** Activer le rate limiting. */
    enabled: z.boolean().default(true),
    /** Store : "memory" (défaut) | "redis" (futur). */
    store: z.enum(["memory", "redis"]).default("memory"),
    /** Presets par défaut. */
    presets: z.record(
      z.string(),
      z.object({
        limit: z.number().int().positive(),
        windowMs: z.number().int().positive(),
      }),
    ).default({}),
  }),

  /** Configuration monitoring (Sentry). */
  monitoring: z.object({
    /** DSN Sentry (public). */
    sentryDsn: z.string().url().optional(),
    /** Activer Sentry. */
    enabled: z.boolean().default(false),
    /** Sample rate (0-1). */
    tracesSampleRate: z.number().min(0).max(1).default(0.1),
  }),

  /** Configuration analytics (PostHog). */
  analytics: z.object({
    /** Clé PostHog (publique). */
    posthogKey: z.string().optional(),
    /** Host PostHog. */
    posthogHost: z.string().url().optional(),
    /** Activer analytics. */
    enabled: z.boolean().default(false),
  }),

  /** Configuration storage. */
  storage: z.object({
    /** Taille max upload (bytes). */
    maxUploadSize: z.number().int().positive().default(10_485_760), // 10MB
    /** Types MIME autorisés. */
    allowedMimeTypes: z.array(z.string()).default([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/csv",
      "application/json",
    ]),
    /** Bucket public. */
    publicBucket: z.string().default("saas_public"),
    /** Bucket privé. */
    privateBucket: z.string().default("saas_private"),
  }),

  /** Configuration jobs/cron. */
  jobs: z.object({
    /** Secret cron (requis en production). */
    cronSecret: z.string().optional(),
    /** Activer les workers. */
    workersEnabled: z.boolean().default(true),
    /** Batch size par défaut. */
    defaultBatchSize: z.number().int().positive().default(10),
    /** Timeout handler par défaut (ms). */
    defaultHandlerTimeoutMs: z.number().int().positive().default(30_000),
    /** Max attempts par défaut. */
    defaultMaxAttempts: z.number().int().positive().default(3),
  }),

  /** Feature flags. */
  features: z.object({
    /** Activer les notifications. */
    notifications: z.boolean().default(true),
    /** Activer les exports. */
    exports: z.boolean().default(true),
    /** Activer les webhooks. */
    webhooks: z.boolean().default(false),
    /** Activer le billing. */
    billing: z.boolean().default(true),
    /** Activer le stockage fichiers. */
    storage: z.boolean().default(true),
    /** Activer les invitations. */
    invitations: z.boolean().default(true),
    /** Activer les équipes/organisations. */
    teams: z.boolean().default(true),
  }),

  /** Limites par défaut. */
  limits: z.object({
    /** Max organisations par utilisateur. */
    maxOrganizationsPerUser: z.number().int().positive().default(10),
    /** Max membres par organisation. */
    maxMembersPerOrganization: z.number().int().positive().default(100),
    /** Max invitations en attente par organisation. */
    maxPendingInvitations: z.number().int().positive().default(50),
    /** Max exports par jour par organisation. */
    maxExportsPerDay: z.number().int().positive().default(10),
    /** Max taille export (lignes). */
    maxExportRows: z.number().int().positive().default(100_000),
  }),

  /** Navigation (pour layout générique). */
  navigation: z.object({
    /** Items principaux du dashboard. */
    main: z.array(z.object({
      label: z.string(),
      href: z.string(),
      icon: z.string().optional(),
      permission: z.string().optional(),
    })).default([]),
    /** Items du menu utilisateur. */
    user: z.array(z.object({
      label: z.string(),
      href: z.string(),
      icon: z.string().optional(),
    })).default([]),
  }),
})

/** Type inféré du schéma. */
export type AppConfig = z.infer<typeof configSchema>

/** Erreur de configuration invalide. */
export class ConfigError extends Error {
  readonly issues: z.ZodIssue[]

  constructor(issues: z.ZodIssue[]) {
    const messages = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    super(`Configuration invalide: ${messages}`)
    this.name = "ConfigError"
    this.issues = issues
  }
}

/** Configuration validée (singleton). */
let validatedConfig: AppConfig | null = null

/** Valide et retourne la configuration centralisée. */
export function getConfig(): AppConfig {
  if (validatedConfig) {
    return validatedConfig
  }

  const rawConfig = buildRawConfig()
  const result = configSchema.safeParse(rawConfig)

  if (!result.success) {
    throw new ConfigError(result.error.issues)
  }

  validatedConfig = result.data
  return validatedConfig
}

/** Construit la config brute depuis les variables d'environnement. */
function buildRawConfig(): Record<string, unknown> {
  const env = getAppEnvironment()

  return {
    environment: env,
    app: {
      name: process.env.NEXT_PUBLIC_APP_NAME ?? "SaaS Starter",
      description: process.env.NEXT_PUBLIC_APP_DESCRIPTION,
      tagline: process.env.NEXT_PUBLIC_APP_TAGLINE,
      url: process.env.NEXT_PUBLIC_APP_URL ?? (env === "production" ? "https://app.example.com" : "http://localhost:3000"),
      logo: {
        src: "/logo.svg",
        alt: "Logo",
      },
      favicon: "/favicon.ico",
    },
    auth: {
      sessionDuration: Number(process.env.AUTH_SESSION_DURATION ?? 3600),
      enableSignup: process.env.AUTH_ENABLE_SIGNUP !== "false",
      enableEmailConfirmation: process.env.AUTH_ENABLE_EMAIL_CONFIRMATION !== "false",
      loginRedirect: process.env.AUTH_LOGIN_REDIRECT ?? "/dashboard",
      signupRedirect: process.env.AUTH_SIGNUP_REDIRECT ?? "/dashboard",
    },
    email: {
      provider: (process.env.EMAIL_PROVIDER as "dev" | "resend") ?? (process.env.RESEND_API_KEY ? "resend" : "dev"),
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? (process.env.EMAIL_PROVIDER === "dev" ? "no-reply@localhost" : ""),
      fromName: process.env.EMAIL_FROM_NAME,
      sendTimeoutMs: Number(process.env.EMAIL_SEND_TIMEOUT_MS ?? 10_000),
      sendAttempts: Number(process.env.EMAIL_SEND_ATTEMPTS ?? 3),
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== "false",
      store: (process.env.RATE_LIMIT_STORE as "memory" | "redis") ?? "memory",
      presets: {},
    },
    monitoring: {
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    },
    analytics: {
      posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      enabled: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
    },
    storage: {
      maxUploadSize: Number(process.env.STORAGE_MAX_UPLOAD_SIZE ?? 10_485_760),
      allowedMimeTypes: [],
      publicBucket: process.env.STORAGE_PUBLIC_BUCKET ?? "saas_public",
      privateBucket: process.env.STORAGE_PRIVATE_BUCKET ?? "saas_private",
    },
    jobs: {
      cronSecret: process.env.CRON_SECRET,
      workersEnabled: process.env.JOBS_WORKERS_ENABLED !== "false",
      defaultBatchSize: Number(process.env.JOBS_DEFAULT_BATCH_SIZE ?? 10),
      defaultHandlerTimeoutMs: Number(process.env.JOBS_DEFAULT_HANDLER_TIMEOUT_MS ?? 30_000),
      defaultMaxAttempts: Number(process.env.JOBS_DEFAULT_MAX_ATTEMPTS ?? 3),
    },
    features: {
      notifications: process.env.FEATURE_NOTIFICATIONS !== "false",
      exports: process.env.FEATURE_EXPORTS !== "false",
      webhooks: process.env.FEATURE_WEBHOOKS === "true",
      billing: process.env.FEATURE_BILLING !== "false",
      storage: process.env.FEATURE_STORAGE !== "false",
      invitations: process.env.FEATURE_INVITATIONS !== "false",
      teams: process.env.FEATURE_TEAMS !== "false",
    },
    limits: {
      maxOrganizationsPerUser: Number(process.env.LIMIT_MAX_ORGS_PER_USER ?? 10),
      maxMembersPerOrganization: Number(process.env.LIMIT_MAX_MEMBERS_PER_ORG ?? 100),
      maxPendingInvitations: Number(process.env.LIMIT_MAX_PENDING_INVITATIONS ?? 50),
      maxExportsPerDay: Number(process.env.LIMIT_MAX_EXPORTS_PER_DAY ?? 10),
      maxExportRows: Number(process.env.LIMIT_MAX_EXPORT_ROWS ?? 100_000),
    },
    navigation: {
      main: [],
      user: [],
    },
  }
}

/** Reset la config validée (pour tests). */
export function resetConfig(): void {
  validatedConfig = null
}

/** Récupère une section typée de la config. */
export function getConfigSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
  return getConfig()[section]
}