import { beforeEach, describe, expect, it, vi } from "vitest"

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getCurrentUser: vi.fn(),
    createSupabaseServerClient: vi.fn(),
  },
}))

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

import { listUserOrganizations } from "./index"

function membershipsClient(
  data: unknown,
  error: { message: string } | null = null,
) {
  return {
    from: () => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data, error })),
      })),
    }),
  }
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.createSupabaseServerClient.mockReset()
})

describe("listUserOrganizations", () => {
  it("retourne [] sans utilisateur connecté", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    expect(await listUserOrganizations()).toEqual([])
  })

  it("retourne [] quand le client est indisponible", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockResolvedValue(null)

    expect(await listUserOrganizations()).toEqual([])
  })

  it("retourne [] en cas d'erreur de lecture (jamais d'exception)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      membershipsClient(null, { message: "permission denied" }),
    )

    expect(await listUserOrganizations()).toEqual([])
  })

  it("aplatit les organisations et trie par nom", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      membershipsClient([
        {
          role: "member",
          organizations: { id: "org-beta", name: "Beta" },
        },
        {
          role: "owner",
          organizations: [
            { id: "org-alpha", name: "Alpha" },
            { id: "org-gamma", name: "Gamma" },
          ],
        },
        { role: "admin", organizations: null },
      ]),
    )

    expect(await listUserOrganizations()).toEqual([
      { id: "org-alpha", name: "Alpha", role: "owner" },
      { id: "org-beta", name: "Beta", role: "member" },
      { id: "org-gamma", name: "Gamma", role: "owner" },
    ])
  })
})