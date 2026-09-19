import { afterEach, describe, expect, it } from "vitest"

import { getEmailEnv, isEmailConfigured } from "./env"

const PLAYBOOK: Array<{
  name: string
  env: { EMAIL_PROVIDER?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string }
  provider: "dev" | "resend"
  configured: boolean
}> = [
  {
    name: "sans rien → dev",
    env: {},
    provider: "dev",
    configured: true,
  },
  {
    name: "RESEND_API_KEY seule → resend",
    env: { RESEND_API_KEY: "re_123" },
    provider: "resend",
    configured: false,
  },
  {
    name: "RESEND_API_KEY + EMAIL_FROM → resend configuré",
    env: { RESEND_API_KEY: "re_123", EMAIL_FROM: "hi@acme.test" },
    provider: "resend",
    configured: true,
  },
  {
    name: "EMAIL_PROVIDER=dev force le dev même avec une clé",
    env: { EMAIL_PROVIDER: "dev", RESEND_API_KEY: "re_123" },
    provider: "dev",
    configured: true,
  },
  {
    name: "EMAIL_PROVIDER=resend sans from → non configuré",
    env: { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_123" },
    provider: "resend",
    configured: false,
  },
]

function withEnv(windowEnv: Record<string, string>, fn: () => void) {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(windowEnv)) {
    saved[key] = process.env[key]
    process.env[key] = windowEnv[key]
  }
  try {
    fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

afterEach(() => {
  delete process.env.EMAIL_PROVIDER
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  delete process.env.EMAIL_FROM_NAME
})

describe("getEmailEnv", () => {
  for (const play of PLAYBOOK) {
    it(`— ${play.name}`, () => {
      withEnv(play.env, () => {
        const env = getEmailEnv()
        expect(env.provider).toBe(play.provider)
        expect(isEmailConfigured()).toBe(play.configured)
      })
    })
  }
})