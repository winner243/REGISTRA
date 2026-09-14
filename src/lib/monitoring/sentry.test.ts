import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as Sentry from "@sentry/nextjs"

function loadEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(".env.local", "utf-8")
    const out: Record<string, string> = {}
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/)
      if (match) {
        out[match[1].trim()] = match[2].trim()
      }
    }
    return out
  } catch {
    return {}
  }
}

// Lu à la collecte (pas dans beforeEach) pour que it.skipIf(!dsn) soit correct.
const env = loadEnvLocal()
const dsn = env["NEXT_PUBLIC_SENTRY_DSN"]

if (dsn) {
  process.env.NEXT_PUBLIC_SENTRY_DSN = dsn
}

describe("sentry (serveur)", () => {
  // DSN optionnel : en CI, `.env.local` n'existe pas et le SDK reste inactif.
  it.skipIf(!dsn)("le DSN, s'il est configuré, a le format d'un DSN Sentry", () => {
    expect(dsn).toMatch(/^https:\/\/.+@.+\.ingest\./)
  })

  it("expose les hooks serveur de capture", () => {
    expect(typeof Sentry.captureException).toBe("function")
    expect(typeof Sentry.captureRequestError).toBe("function")
  })

  it.skipIf(!dsn)("initialise un client et capture une erreur de bout en bout", async () => {
    const captured: string[] = []
    const client = Sentry.init({
      dsn,
      beforeSend(event) {
        captured.push(event.exception?.values?.[0]?.value ?? event.message ?? "")
        return null
      },
    })

    expect(client).toBeTruthy()

    const error = new Error("erreur de test sentry")
    Sentry.captureException(error)

    const deadline = Date.now() + 2000
    while (captured.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }

    expect(captured.length).toBeGreaterThan(0)
    expect(captured[0]).toMatch(/erreur de test sentry/i)

    Sentry.getClient()?.flush(2000)
  })
})
