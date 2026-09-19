import { afterEach, describe, expect, it, vi } from "vitest"
import { getConfig, getConfigSection, resetConfig, ConfigError, configSchema, getAppEnvironment } from "@/config"

const originalEnv = { ...process.env }

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

afterEach(() => {
  process.env = { ...originalEnv }
  resetConfig()
  vi.useRealTimers()
})

describe("getAppEnvironment", () => {
  it("détecte development par défaut", () => {
    setEnv({ NODE_ENV: "development", VERCEL_ENV: undefined })
    expect(getAppEnvironment()).toBe("development")
  })

  it("détecte production via VERCEL_ENV", () => {
    setEnv({ NODE_ENV: "production", VERCEL_ENV: "production" })
    expect(getAppEnvironment()).toBe("production")
  })

  it("détecte preview via VERCEL_ENV", () => {
    setEnv({ NODE_ENV: "production", VERCEL_ENV: "preview" })
    expect(getAppEnvironment()).toBe("preview")
  })
})

describe("configSchema validation", () => {
  it("valide une config minimale complète", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    })

    const config = getConfig()
    expect(config.environment).toBe("development")
    expect(config.supabase.url).toBe("https://test.supabase.co")
    expect(config.email.from).toBe("test@example.com")
    expect(config.jobs.cronSecret).toBe("secret")
  })

  it("rejette config sans Supabase URL", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
    })

    expect(() => getConfig()).toThrow(ConfigError)
  })

  it("rejette config sans email from en mode resend", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      RESEND_API_KEY: "re_123",
      CRON_SECRET: "secret",
    })

    expect(() => getConfig()).toThrow(ConfigError)
  })

  it("accepte email from vide en mode dev", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_PROVIDER: "dev",
      CRON_SECRET: "secret",
    })

    const config = getConfig()
    expect(config.email.provider).toBe("dev")
    expect(config.email.from).toBe("no-reply@localhost")
  })

  it("défaut feature flags à true (sauf webhooks)", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
    })

    const config = getConfig()
    expect(config.features.notifications).toBe(true)
    expect(config.features.exports).toBe(true)
    expect(config.features.webhooks).toBe(false)
    expect(config.features.billing).toBe(true)
    expect(config.features.storage).toBe(true)
    expect(config.features.invitations).toBe(true)
    expect(config.features.teams).toBe(true)
  })

  it("feature flags respectent variables d'env", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
      FEATURE_WEBHOOKS: "true",
      FEATURE_NOTIFICATIONS: "false",
    })

    const config = getConfig()
    expect(config.features.webhooks).toBe(true)
    expect(config.features.notifications).toBe(false)
  })

  it("rate limit store par défaut memory", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
    })

    const config = getConfig()
    expect(config.rateLimit.store).toBe("memory")
    expect(config.rateLimit.enabled).toBe(true)
  })

  it("storage defaults", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
    })

    const config = getConfig()
    expect(config.storage.maxUploadSize).toBe(10_485_760)
    expect(config.storage.publicBucket).toBe("saas_public")
    expect(config.storage.privateBucket).toBe("saas_private")
  })

  it("jobs defaults", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
    })

    const config = getConfig()
    expect(config.jobs.workersEnabled).toBe(true)
    expect(config.jobs.defaultBatchSize).toBe(10)
    expect(config.jobs.defaultHandlerTimeoutMs).toBe(30_000)
    expect(config.jobs.defaultMaxAttempts).toBe(3)
  })

  it("monitoring enabled seulement si DSN présent", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
      NEXT_PUBLIC_SENTRY_DSN: "https://key@sentry.io/123",
    })

    const config = getConfig()
    expect(config.monitoring.enabled).toBe(true)
    expect(config.monitoring.sentryDsn).toBe("https://key@sentry.io/123")
  })

  it("analytics enabled seulement si clé PostHog", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_123",
    })

    const config = getConfig()
    expect(config.analytics.enabled).toBe(true)
    expect(config.analytics.posthogKey).toBe("phc_123")
  })

  it("resetConfig permet re-validation", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
    })

    const config1 = getConfig()
    expect(config1.app.name).toBe("SaaS Starter")

    setEnv({ NEXT_PUBLIC_APP_NAME: "My Custom App" })
    resetConfig()

    const config2 = getConfig()
    expect(config2.app.name).toBe("My Custom App")
  })
})

describe("getConfigSection", () => {
  it("retourne section typée", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      EMAIL_FROM: "test@example.com",
      CRON_SECRET: "secret",
    })

    const email = getConfigSection("email")
    expect(email.provider).toBeDefined()
    expect(email.from).toBe("test@example.com")
  })
})