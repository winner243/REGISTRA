import { beforeEach, describe, expect, it, vi } from "vitest"

import { defaultRateLimiter } from "@/lib/rate-limit/limiter"

const { mocks } = vi.hoisted(() => ({
  mocks: {
    headers: vi.fn(),
    redirect: vi.fn(),
    isSupabaseConfigured: vi.fn(() => true),
    createSupabaseServerClient: vi.fn(),
  },
}))

vi.mock("next/headers", () => ({ headers: mocks.headers }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

import {
  forgotPassword,
  login,
  resetPassword,
  signOut,
  signUp,
} from "./actions"

type Auth = {
  signInWithPassword?: (input: unknown) => Promise<unknown>
  signUp?: (input: unknown) => Promise<unknown>
  resetPasswordForEmail?: (email: string, options?: unknown) => Promise<unknown>
  updateUser?: (input: unknown) => Promise<unknown>
  signOut?: () => Promise<unknown>
}

function makeSupabaseClient(auth: Auth = {}) {
  return {
    auth: {
      signInWithPassword:
        auth.signInWithPassword ??
        vi.fn(async () => ({ data: { session: {} }, error: null })),
      signUp:
        auth.signUp ??
        vi.fn(async () => ({
          data: { user: { id: "u1" }, session: { access_token: "token" } },
          error: null,
        })),
      resetPasswordForEmail:
        auth.resetPasswordForEmail ??
        vi.fn(async () => ({ data: {}, error: null })),
      updateUser:
        auth.updateUser ?? vi.fn(async () => ({ data: { user: {} }, error: null })),
      signOut: auth.signOut ?? vi.fn(async () => ({ error: null })),
    },
  }
}

function formData(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) {
    fd.set(key, value)
  }
  return fd
}

const LOGIN_DATA = { email: "user@example.com", password: "motdepasse" }
const SIGNUP_DATA = {
  email: "user@example.com",
  password: "motdepasse",
  confirmPassword: "motdepasse",
}
const RESET_DATA = {
  password: "nouveaumotdepasse",
  confirmPassword: "nouveaumotdepasse",
}

let headerValues: Record<string, string>

beforeEach(() => {
  headerValues = { origin: "http://localhost:3000" }
  mocks.headers.mockImplementation(async () => ({
    get: (name: string) => headerValues[name] ?? null,
  }))
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT")
  })
  mocks.isSupabaseConfigured.mockReturnValue(true)
  mocks.createSupabaseServerClient.mockReset()
  defaultRateLimiter.clear()
})

describe("login", () => {
  it("renvoie un message générique sur de mauvais identifiants", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      makeSupabaseClient({
        signInWithPassword: async () => ({
          data: { session: null },
          error: { message: "Invalid login credentials" },
        }),
      }),
    )

    const result = await login(null, formData(LOGIN_DATA))
    expect(result.error).toBe(
      "Identifiants incorrects. Vérifie tes informations.",
    )
  })

  it("rejette une entrée invalide avant tout appel réseau", async () => {
    const result = await login(null, formData({ email: "pas-un-email", password: "" }))
    expect(result.error).toBe("Adresse email invalide.")
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("redirige vers le dashboard après un succès", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { session: {} },
      error: null,
    }))
    const client = makeSupabaseClient({ signInWithPassword })
    mocks.createSupabaseServerClient.mockResolvedValue(client)

    await expect(login(null, formData(LOGIN_DATA))).rejects.toThrow("NEXT_REDIRECT")
    expect(signInWithPassword).toHaveBeenCalledTimes(1)
  })

  it("bloque les tentatives au-delà de la limite (brute force)", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { session: {} },
      error: null,
    }))
    const client = makeSupabaseClient({ signInWithPassword })
    mocks.createSupabaseServerClient.mockResolvedValue(client)
    headerValues["x-real-ip"] = "203.0.113.7"

    for (let i = 0; i < 10; i += 1) {
      try {
        await login(null, formData(LOGIN_DATA))
      } catch (error) {
        if ((error as Error).message !== "NEXT_REDIRECT") throw error
      }
    }

    const result = await login(null, formData(LOGIN_DATA))
    expect(result.error).toBe("Trop de requêtes. Réessaie plus tard.")
    expect(signInWithPassword).toHaveBeenCalledTimes(10)
  })
})

describe("signUp", () => {
  it("traduit 'User already registered' en un message français", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      makeSupabaseClient({
        signUp: async () => ({
          data: { user: null, session: null },
          error: { message: "User already registered", code: "email_exists" },
        }),
      }),
    )

    const result = await signUp(null, formData(SIGNUP_DATA))
    expect(result.error).toBe("Un compte existe déjà avec cette adresse email.")
  })

  it("ne fuit pas un message d'erreur inconnu en anglais", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      makeSupabaseClient({
        signUp: async () => ({
          data: { user: null, session: null },
          error: { message: "provider raw error detail", code: "x_1" },
        }),
      }),
    )

    const result = await signUp(null, formData(SIGNUP_DATA))
    expect(result.error).toBe(
      "Une erreur est survenue lors de l'inscription. Réessaie.",
    )
  })

  it("renvoie le message de confirmation quand l'email est requis", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      makeSupabaseClient({
        signUp: async () => ({
          data: { user: { id: "u1" }, session: null },
          error: null,
        }),
      }),
    )

    const result = await signUp(null, formData(SIGNUP_DATA))
    expect(result.success).toContain("Vérifie ta boîte mail")
  })

  it("redirige quand la session est créée immédiatement", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () => makeSupabaseClient())

    await expect(signUp(null, formData(SIGNUP_DATA))).rejects.toThrow("NEXT_REDIRECT")
  })
})

describe("forgotPassword", () => {
  it("envoie le lien vers l'origine détectée", async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }))
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      makeSupabaseClient({ resetPasswordForEmail }),
    )

    const result = await forgotPassword(null, formData({ email: "user@example.com" }))
    expect(result.success).toContain("lien de réinitialisation")
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "user@example.com",
      { redirectTo: "http://localhost:3000/reset-password" },
    )
  })
})

describe("resetPassword", () => {
  it("confirme la mise à jour du mot de passe", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () => makeSupabaseClient())

    const result = await resetPassword(null, formData(RESET_DATA))
    expect(result.success).toContain("Mot de passe mis à jour")
  })

  it("refuse quand Supabase n'est pas configuré", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false)
    mocks.createSupabaseServerClient.mockImplementation(async () => null)

    const result = await resetPassword(null, formData(RESET_DATA))
    expect(result.error).toContain("Supabase n'est pas configuré")
  })
})

describe("signOut", () => {
  it("déconnecte puis redirige vers /login", async () => {
    const signOutMock = vi.fn(async () => ({ error: null }))
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      makeSupabaseClient({ signOut: signOutMock }),
    )

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT")
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })
})