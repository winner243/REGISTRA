import { beforeEach, describe, expect, it, vi } from "vitest"

const { mocks } = vi.hoisted(() => ({
  mocks: {
    redirect: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }))

import { isPlatformAdmin, requirePlatformAdmin } from "./platform-admin"

function fakeUser(appMetadata: Record<string, unknown> | undefined) {
  return {
    id: "user-1",
    email: "user@example.com",
    app_metadata: appMetadata,
  } as never
}

beforeEach(() => {
  mocks.redirect.mockReset()
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT")
  })
  mocks.getCurrentUser.mockReset()
})

describe("isPlatformAdmin", () => {
  it("accepte uniquement le claim platform_admin === true", () => {
    expect(isPlatformAdmin(fakeUser({ platform_admin: true }))).toBe(true)
  })

  it("refuse un claim absent", () => {
    expect(isPlatformAdmin(fakeUser({}))).toBe(false)
    expect(isPlatformAdmin(fakeUser(undefined))).toBe(false)
  })

  it("refuse un claim faux ou de type non booléen", () => {
    expect(isPlatformAdmin(fakeUser({ platform_admin: false }))).toBe(false)
    expect(isPlatformAdmin(fakeUser({ platform_admin: "true" }))).toBe(false)
    expect(isPlatformAdmin(fakeUser({ platform_admin: 1 }))).toBe(false)
  })

  it("refuse un utilisateur null", () => {
    expect(isPlatformAdmin(null)).toBe(false)
  })

  it("ignore un claim fabriqué dans user_metadata (non accepté)", () => {
    const user = {
      id: "user-1",
      app_metadata: {},
      user_metadata: { platform_admin: true },
    } as never
    expect(isPlatformAdmin(user)).toBe(false)
  })
})

describe("requirePlatformAdmin", () => {
  it("redirige vers /login sans session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.redirect).toHaveBeenCalledWith("/login")
  })

  it("redirige vers /dashboard pour un utilisateur ordinaire (déni)", async () => {
    mocks.getCurrentUser.mockResolvedValue(fakeUser({}))

    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard")
  })

  it("retourne l'utilisateur pour un super admin de plateforme", async () => {
    const admin = fakeUser({ platform_admin: true })
    mocks.getCurrentUser.mockResolvedValue(admin)

    expect(await requirePlatformAdmin()).toEqual(admin)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
