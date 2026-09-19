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

import { can, getRole, RbacError, requireOrgMember, requirePermission } from "./index"

const ORG = "org-1"

function rpcClient(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  }
}

function membershipsClient(
  data: { id?: string; role?: string } | null,
  error: { message: string } | null = null,
) {
  return {
    from: () => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data, error })),
          })),
        })),
      })),
    }),
  }
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.createSupabaseServerClient.mockReset()
})

describe("can", () => {
  it("retourne false sans client Supabase", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(null)
    expect(await can(ORG, "organization.read")).toBe(false)
  })

  it("retourne false en cas d'erreur RPC (jamais d'exception)", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      rpcClient(null, { message: "permission denied" }),
    )
    expect(await can(ORG, "organization.read")).toBe(false)
  })

  it("retourne true uniquement quand la base répond exactement true", async () => {
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      rpcClient(true),
    )
    expect(await can(ORG, "organization.read")).toBe(true)

    mocks.createSupabaseServerClient.mockImplementation(async () =>
      rpcClient("oui"),
    )
    expect(await can(ORG, "organization.read")).toBe(false)
  })
})

describe("requirePermission", () => {
  it("lève unauthorized sans utilisateur connecté", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    await expect(requirePermission(ORG, "members.invite")).rejects.toMatchObject({
      code: "unauthorized",
    })
  })

  it("lève forbidden quand la base refuse la permission", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      rpcClient(false),
    )
    await expect(requirePermission(ORG, "members.invite")).rejects.toMatchObject({
      code: "forbidden",
    })
  })

  it("ne lève rien quand la permission est accordée", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      rpcClient(true),
    )
    await expect(requirePermission(ORG, "members.invite")).resolves.toBeUndefined()
  })
})

describe("requireOrgMember", () => {
  it("lève unauthorized sans utilisateur", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    await expect(requireOrgMember(ORG)).rejects.toThrowError(RbacError)
  })

  it("lève forbidden si l'appartenance n'existe pas", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      membershipsClient(null),
    )
    await expect(requireOrgMember(ORG)).rejects.toMatchObject({ code: "forbidden" })
  })

  it("accepte un membre", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      membershipsClient({ id: "m1" }),
    )
    await expect(requireOrgMember(ORG)).resolves.toBeUndefined()
  })
})

describe("getRole", () => {
  it("retourne null sans utilisateur", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    expect(await getRole(ORG)).toBeNull()
  })

  it("retourne le rôle du membre", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      membershipsClient({ role: "admin" }),
    )
    expect(await getRole(ORG)).toBe("admin")
  })

  it("retourne null en cas d'erreur de lecture", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" })
    mocks.createSupabaseServerClient.mockImplementation(async () =>
      membershipsClient(null, { message: "permission denied" }),
    )
    expect(await getRole(ORG)).toBeNull()
  })
})