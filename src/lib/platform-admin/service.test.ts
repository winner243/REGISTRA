import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tests du service privilégié Super Admin.
 *
 * Couverture exigée par le cahier des charges P1 :
 *   - positif : une session vérifiée portant `platform_admin: true` obtient
 *     les lectures globales ;
 *   - négatif : sans session / sans claim, l'accès est refusé ET le client
 *     privilégié n'est JAMAIS fabriqué (preuve d'absence de fuite) ;
 *   - négatif : client d'administration non configuré → erreur explicite,
 *     jamais de repli silencieux vers un accès partiel ;
 *   - négatif : échec de requête → erreur remontée, pas de donnée tronquée
 *     présentée comme complète ;
 *   - positif/négatif : l'écriture privilégiée (renommage d'établissement)
 *     vérifie le claim **pour l'opération**, avant toute fabrication de client
 *     et avant toute requête, et refuse les entrées invalides sans toucher à la
 *     base ;
 *   - invariant : la surface publique du module est une liste blanche
 *     explicite et ne contient aucune opération destructive.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    requirePlatformAdmin: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
  },
}))

vi.mock("@/lib/auth/platform-admin", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

import * as service from "./service"
import { PlatformAdminError } from "./service"

type Result = { data: unknown; error: { message: string } | null }

function makeBuilder(result: Result) {
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    update: () => builder,
    eq: () => builder,
    upsert: () => builder,
    then: (onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return builder
}

function makeClient(
  tables: Record<string, Result> = {},
  listUsers: { data: { users: unknown[] } | null; error: { message: string } | null } = {
    data: { users: [] },
    error: null,
  },
) {
  return {
    from: (table: string) => makeBuilder(tables[table] ?? { data: [], error: null }),
    auth: { admin: { listUsers: async () => listUsers } },
  } as never
}

/** Autorise l'accès et enregistre l'ordre réel des appels critiques. */
function authorize(calls: string[], client: unknown = makeClient()) {
  mocks.requirePlatformAdmin.mockImplementation(async () => {
    calls.push("guard")
    return { id: "admin-1", email: "admin@example.com" }
  })
  mocks.createSupabaseAdminClient.mockImplementation(async () => {
    calls.push("client")
    return client
  })
}

beforeEach(() => {
  mocks.requirePlatformAdmin.mockReset()
  mocks.createSupabaseAdminClient.mockReset()
})

describe("contrôle d'accès aux opérations privilégiées", () => {
  it("positif : renvoie les établissements globalement quand le claim est valide", async () => {
    authorize([], makeClient({
      organizations: {
        data: [{ id: "o1", name: "École A", created_by: "u1", created_at: "2026-01-01T00:00:00Z" }],
        error: null,
      },
      memberships: { data: [{ organization_id: "o1" }, { organization_id: "o1" }], error: null },
      organization_registra_settings: {
        data: [{ organization_id: "o1", organization_type: "school" }],
        error: null,
      },
      subscriptions: {
        data: [{ organization_id: "o1", plan_code: "pro", status: "active", current_period_start: "2026-01-01", current_period_end: "2026-02-01" }],
        error: null,
      },
    }))

    const rows = await service.listPlatformOrganizations()

    // La garde est ré-exécutée pour CHAQUE lecture privilégiée.
    expect(mocks.requirePlatformAdmin).toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalled()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: "o1",
      name: "École A",
      memberCount: 2,
      orgType: "school",
      planCode: "pro",
      subscriptionStatus: "active",
      hasSubscription: true,
    })
  })

  it("négatif : sans claim, le refus précède toujours la fabrication du client privilégié", async () => {
    const calls: string[] = []
    mocks.requirePlatformAdmin.mockImplementation(async () => {
      calls.push("guard")
      throw new Error("NEXT_REDIRECT")
    })
    mocks.createSupabaseAdminClient.mockImplementation(async () => {
      calls.push("client")
      return makeClient()
    })

    await expect(service.getPlatformStats()).rejects.toThrow("NEXT_REDIRECT")
    // Preuve d'absence de fuite : aucun client privilégié n'a été fabriqué,
    // quel que soit le nombre de lectures demandées.
    expect(calls).not.toContain("client")
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("négatif : l'ordre est bien contrôle puis client, pour chaque lecture", async () => {
    const calls: string[] = []
    authorize(calls)

    await service.listPlatformUsers()
    await service.getPlatformStats()

    // Le premier appel est toujours le contrôle d'accès, et aucun client
    // privilégié ne peut exister avant lui.
    expect(calls[0]).toBe("guard")
    expect(calls.indexOf("client")).toBeGreaterThan(0)
    // Un contrôle par client fabriqué au maximum.
    const guards = calls.filter((c) => c === "guard").length
    const clients = calls.filter((c) => c === "client").length
    expect(clients).toBeGreaterThan(0)
    expect(clients).toBeLessThanOrEqual(guards)
  })

  it("négatif : client d'administration absent → erreur explicite, pas de repli", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ id: "a", email: "a@b.c" } as never)
    mocks.createSupabaseAdminClient.mockResolvedValue(null)

    await expect(service.listPlatformOrganizations()).rejects.toMatchObject({
      name: "PlatformAdminError",
      code: "not_configured",
    })
  })

  it("négatif : échec de requête → PlatformAdminError, jamais de résultat partiel silencieux", async () => {
    authorize([], makeClient({
      organizations: { data: null, error: { message: "column organizations.x does not exist" } },
    }))

    await expect(service.listPlatformOrganizations()).rejects.toMatchObject({
      code: "query_failed",
      message: expect.stringContaining("does not exist"),
    })
  })

  it("négatif : échec de l'API admin Auth → erreur remontée", async () => {
    authorize(
      [],
      makeClient({}, { data: null, error: { message: "admin list failed" } }),
    )

    await expect(service.listPlatformUsers()).rejects.toMatchObject({
      code: "query_failed",
    })
  })
})

describe("distingue les comptes Auth des profils applicatifs", () => {
  it("signale explicitement un compte Auth sans profil au lieu de le masquer", async () => {
    authorize([], makeClient(
      {
        profiles: { data: [{ id: "u-with", full_name: "Alice Dupont" }], error: null },
        memberships: { data: [{ organization_id: "o1", user_id: "u-with", role: "owner" }], error: null },
        organizations: { data: [{ id: "o1", name: "École A" }], error: null },
      },
      {
        data: {
          users: [
            { id: "u-with", email: "alice@test.fr", created_at: "2026-01-01", last_sign_in_at: "2026-02-01", app_metadata: { platform_admin: true } },
            { id: "u-without", email: "bob@test.fr", created_at: "2026-01-02", last_sign_in_at: null, app_metadata: {} },
          ],
        },
        error: null,
      },
    ))

    const users = await service.listPlatformUsers()

    expect(users).toHaveLength(2)

    const alice = users.find((u) => u.id === "u-with")!
    expect(alice).toMatchObject({
      fullName: "Alice Dupont",
      hasProfile: true,
      platformAdmin: true,
    })
    expect(alice.memberships).toEqual([
      { organizationId: "o1", organizationName: "École A", role: "owner" },
    ])

    const bob = users.find((u) => u.id === "u-without")!
    expect(bob.hasProfile).toBe(false)
    expect(bob.fullName).toBeNull()
    expect(bob.memberships).toEqual([])
    expect(bob.platformAdmin).toBe(false)
  })

  it("refuse d'attribuer un profil à un compte qui n'en a pas (pas de correspondance fantôme)", async () => {
    authorize([], makeClient(
      { profiles: { data: [{ id: "someone-else", full_name: "Nom Fantôme" }], error: null } },
      { data: { users: [{ id: "u-none", email: "x@test.fr", created_at: "2026-01-01", last_sign_in_at: null, app_metadata: {} }] }, error: null },
    ))

    const users = await service.listPlatformUsers()
    expect(users[0].hasProfile).toBe(false)
    expect(users[0].fullName).toBeNull()
  })
})

describe("compteurs réels", () => {
  it("n'invente aucune valeur : tout est compté sur la réponse", async () => {
    authorize([], makeClient({
      organizations: { data: [{ id: "o1" }, { id: "o2" }], error: null },
      memberships: { data: [{ id: "m1" }], error: null },
      groups: { data: [{ id: "g1" }, { id: "g2" }, { id: "g3" }], error: null },
      persons: { data: [{ id: "p1" }], error: null },
      attendance_records: { data: [{ id: "a1" }], error: null },
      subscriptions: { data: [{ id: "s1", status: "active" }, { id: "s2", status: "canceled" }], error: null },
    }, { data: { users: [{ id: "u1" }] }, error: null }))

    const stats = await service.getPlatformStats()

    expect(stats).toEqual({
      organizations: 2,
      users: 1,
      memberships: 1,
      groups: 3,
      persons: 1,
      attendanceRecords: 1,
      subscriptionsByStatus: { active: 1, canceled: 1 },
      orgsWithSubscription: 2,
    })
  })
})

describe("invariant : surface publique limitée à une liste blanche", () => {
  it("n'expose que les opérations revues — toute exportation nouvelle exige une modification explicite", async () => {
    const exported = Object.keys(service)

    expect(exported.sort()).toEqual(
      [
        "PlatformAdminError",
        "ORGANIZATION_NAME_MIN",
        "ORGANIZATION_NAME_MAX",
        "getPlatformStats",
        "listPlatformAttendance",
        "listPlatformOrganizations",
        "listPlatformRoles",
        "listPlatformSubscriptions",
        "listPlatformUsers",
        "updatePlatformOrganization",
      ].sort(),
    )
  })

  it("n'expose ni la fabrique de client, ni aucun moyen de contourner la garde", async () => {
    const exported = Object.keys(service)
    expect(exported).not.toContain("privilegedClient")
    expect(exported).not.toContain("createSupabaseAdminClient")
    expect(exported).not.toContain("requirePlatformAdmin")
  })

  it("n'expose aucune opération destructive de plateforme", async () => {
    const exported = Object.keys(service)
    const forbidden = /delete|remove|drop|destroy|purge|revoke|grant|signOut|signIn/i

    expect(exported.filter((k) => forbidden.test(k))).toEqual([])
  })
})

describe("écriture privilégiée : renommage d'un établissement", () => {
  const VALID_ID = "3f1d2c4a-9b8e-4c7a-8f21-1234567890ab"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("positif : renomme l'établissement après vérification du claim", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)

    const written: { update?: Record<string, unknown>; eq?: unknown[] } = {}
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: string) => {
        written.eq = [col, val]
        return builder
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        written.update = payload
        return builder
      }),
      then: (onF: (v: Result) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: VALID_ID }], error: null }).then(onF, onR),
    }
    mocks.createSupabaseAdminClient.mockResolvedValue({ from: () => builder } as never)

    await expect(
      service.updatePlatformOrganization({ id: VALID_ID, name: "  Nom corrigé  " }),
    ).resolves.toBeUndefined()

    expect(mocks.requirePlatformAdmin).toHaveBeenCalled()
    expect(written.update).toEqual({ name: "Nom corrigé" })
    expect(written.eq).toEqual(["id", VALID_ID])
  })

  it("négatif : sans claim, la garde refuse AVANT toute fabrication de client ou écriture", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new Error("redirect vers /login"))

    await expect(
      service.updatePlatformOrganization({ id: VALID_ID, name: "Nom corrigé" }),
    ).rejects.toThrow("redirect vers /login")

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("négatif : nom invalide → refusé AVANT le moindre accès à la base", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)

    for (const name of ["", " ", "a", "x".repeat(121)]) {
      await expect(
        service.updatePlatformOrganization({ id: VALID_ID, name }),
      ).rejects.toMatchObject({ code: "invalid_input" })
    }

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("négatif : identifiant non-UUID → refusé sans requête", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)

    await expect(
      service.updatePlatformOrganization({ id: "1; drop table organizations", name: "Nom" }),
    ).rejects.toMatchObject({ code: "invalid_input" })

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("négatif : établissement introuvable → erreur explicite, jamais de succès silencieux", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)
    mocks.createSupabaseAdminClient.mockResolvedValue(
      makeClient({ organizations: { data: [], error: null } }),
    )

    await expect(
      service.updatePlatformOrganization({ id: VALID_ID, name: "Nom" }),
    ).rejects.toMatchObject({ code: "not_found" })
  })
})

describe("écriture privilégiée : type REGISTRA", () => {
  const VALID_ID = "3f1d2c4a-9b8e-4c7a-8f21-1234567890ab"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** Client de traçage : enregistre `upsert` et `update` pour assertions. */
  function trackingClient(result: Result) {
    const calls: { upsert?: unknown[]; update?: unknown[] } = {}
    const builder = {
      upsert: vi.fn((payload: unknown, options: unknown) => {
        calls.upsert = [payload, options]
        return builder
      }),
      update: vi.fn((payload: unknown) => {
        calls.update = [payload]
        return builder
      }),
      eq: vi.fn(() => builder),
      select: vi.fn(() => builder),
      then: (onF: (v: Result) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onF, onR),
    }
    const from = vi.fn(() => builder)
    return { client: { from } as never, from, calls, builder }
  }

  it("positif : écrit le type via upsert 1:1, avec vérification du claim", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)
    const tracked = trackingClient({ data: [{ id: VALID_ID }], error: null })
    mocks.createSupabaseAdminClient.mockResolvedValue(tracked.client)

    await service.updatePlatformOrganization({
      id: VALID_ID,
      name: "École centrale",
      organizationType: "school",
    })

    expect(mocks.requirePlatformAdmin).toHaveBeenCalled()
    expect(tracked.calls.upsert?.[0]).toEqual({
      organization_id: VALID_ID,
      organization_type: "school",
    })
    expect(tracked.calls.upsert?.[1]).toEqual({ onConflict: "organization_id" })
    expect(tracked.calls.update?.[0]).toEqual({ name: "École centrale" })
  })

  it("négatif : type hors du CHECK → refusé AVANT toute écriture", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)

    for (const organizationType of ["startup", "", "SCHOOL", "school; drop", "administrative"]) {
      await expect(
        service.updatePlatformOrganization({
          id: VALID_ID,
          name: "Nom",
          organizationType,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" })
    }

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("positif : type omis → la colonne de réglages n'est JAMAIS touchée", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)
    const tracked = trackingClient({ data: [{ id: VALID_ID }], error: null })
    mocks.createSupabaseAdminClient.mockResolvedValue(tracked.client)

    await service.updatePlatformOrganization({ id: VALID_ID, name: "Renommage seul" })

    expect(tracked.calls.upsert).toBeUndefined()
    expect(tracked.calls.update).toEqual([{ name: "Renommage seul" }])
    expect(tracked.from).toHaveBeenCalledTimes(1)
  })

  it("négatif : échec de l'upsert → erreur remontée, le nom n'est pas écrit ensuite", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)
    const tracked = trackingClient({ data: null, error: { message: "violates check constraint" } })
    mocks.createSupabaseAdminClient.mockResolvedValue(tracked.client)

    await expect(
      service.updatePlatformOrganization({
        id: VALID_ID,
        name: "Nom",
        organizationType: "school",
      }),
    ).rejects.toMatchObject({ code: "query_failed" })

    expect(tracked.builder.update).not.toHaveBeenCalled()
  })
})

describe("rôles", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lit les rôles, leurs permissions et leur effectif réel", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)
    mocks.createSupabaseAdminClient.mockResolvedValue(
      makeClient({
        roles: {
          data: [
            { name: "owner", description: "Propriétaire" },
            { name: "member", description: null },
          ],
          error: null,
        },
        permissions: {
          data: [
            { name: "organization.update", description: "Modifier l'organisation" },
            { name: "attendance.create", description: "Créer une présence" },
          ],
          error: null,
        },
        role_permissions: {
          data: [
            { role: "owner", permission: "organization.update" },
            { role: "owner", permission: "attendance.create" },
          ],
          error: null,
        },
        memberships: {
          data: [{ role: "owner" }, { role: "owner" }, { role: "member" }],
          error: null,
        },
      }),
    )

    const roles = await service.listPlatformRoles()

    expect(roles).toEqual([
      {
        name: "owner",
        description: "Propriétaire",
        memberCount: 2,
        permissions: [
          { name: "attendance.create", description: "Créer une présence" },
          { name: "organization.update", description: "Modifier l'organisation" },
        ],
      },
      { name: "member", description: null, memberCount: 1, permissions: [] },
    ])
    expect(mocks.requirePlatformAdmin).toHaveBeenCalled()
  })

  it("ignore une permission référencée sans fiche plutôt que de l'inventer", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined)
    mocks.createSupabaseAdminClient.mockResolvedValue(
      makeClient({
        roles: { data: [{ name: "owner", description: null }], error: null },
        permissions: { data: [], error: null },
        role_permissions: {
          data: [{ role: "owner", permission: "permission.inconnue" }],
          error: null,
        },
        memberships: { data: [], error: null },
      }),
    )

    const roles = await service.listPlatformRoles()
    expect(roles[0]?.permissions).toEqual([])
  })
})

describe("PlatformAdminError", () => {
  it("porte un code métier exploitable", () => {
    const e = new PlatformAdminError("not_configured", "boom")
    expect(e.code).toBe("not_configured")
    expect(e.message).toBe("boom")
    expect(e instanceof Error).toBe(true)
  })
})
