import { beforeEach, describe, expect, it, vi } from "vitest"

const { mocks } = vi.hoisted(() => ({
  mocks: {
    redirect: vi.fn(),
    isSupabaseConfigured: vi.fn(() => true),
    createSupabaseServerClient: vi.fn(),
  },
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

import { getCurrentUser, isAuthenticated, requireUser } from "./session"

const FAKE_USER = {
  id: "user-1",
  email: "user@example.com",
  user_metadata: { name: "Yanis" },
}

beforeEach(() => {
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT")
  })
  mocks.isSupabaseConfigured.mockReturnValue(true)
  mocks.createSupabaseServerClient.mockReset()
})

describe("getCurrentUser", () => {
  it("retourne l'utilisateur de session", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () => ({
      auth: {
        getUser: async () => ({ data: { user: FAKE_USER }, error: null }),
      },
    }))

    expect(await getCurrentUser()).toEqual(FAKE_USER)
  })

  it("retourne null sans session", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () => ({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }))

    expect(await getCurrentUser()).toBeNull()
  })

  it("retourne null quand Supabase n'est pas configuré", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false)
    mocks.createSupabaseServerClient.mockImplementation(async () => null)

    expect(await getCurrentUser()).toBeNull()
  })
})

describe("requireUser", () => {
  it("retourne l'utilisateur connecté", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () => ({
      auth: {
        getUser: async () => ({ data: { user: FAKE_USER }, error: null }),
      },
    }))

    expect(await requireUser()).toEqual(FAKE_USER)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("redirige vers /login sans utilisateur", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () => ({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }))

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.redirect).toHaveBeenCalledWith("/login")
  })
})

describe("isAuthenticated", () => {
  it("est vrai avec un utilisateur, faux sinon", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () => ({
      auth: {
        getUser: async () => ({ data: { user: FAKE_USER }, error: null }),
      },
    }))
    expect(await isAuthenticated()).toBe(true)

    mocks.createSupabaseServerClient.mockImplementation(async () => ({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }))
    expect(await isAuthenticated()).toBe(false)
  })
})