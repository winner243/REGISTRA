import { beforeEach, describe, expect, it, vi } from "vitest"

const { mocks } = vi.hoisted(() => ({
  mocks: {
    isEmailConfigured: vi.fn(() => true),
  },
}))

vi.mock("@/lib/email", () => ({
  isEmailConfigured: mocks.isEmailConfigured,
}))

import { NotificationError } from "./types"
import {
  isChannelAllowed,
  NotificationService,
  resolveEmailDelivery,
} from "./service"

const generalTemplate = {
  name: "general",
  description: "générique",
  channels: ["in_app", "email"] as ("in_app" | "email" | "push")[],
  enabled: true,
}

function templateWith(options: Partial<typeof generalTemplate>) {
  return { ...generalTemplate, ...options }
}

interface ClientOptions {
  template?: typeof generalTemplate | null
  preferences?: { enabled: boolean } | null
  createResult?: { data: unknown; error: unknown }
  createOrganizationResult?: { data: unknown; error: unknown }
  createError?: boolean
}

/**
 * Client Supabase factice : la sélection dépend de la table demandée.
 * `notification_templates` sert le catalogue ; `notification_preferences`
 * sert la préférence email ; toute autre table renvoie données null.
 */
function client(options: ClientOptions = {}) {
  const {
    template = generalTemplate,
    preferences = null,
    createResult = { data: "notif-1", error: null },
    createOrganizationResult = { data: 3, error: null },
  } = options

  const selectTemplate = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: template, error: null })),
      })),
    })),
  }
  const selectPreferences = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: preferences, error: null })),
        })),
      })),
    })),
  }

  return {
    rpc: vi.fn(async (fn: string, _args: object) => {
      if (fn === "create_notification") {
        return options.createError
          ? { data: null, error: new Error("boom") }
          : createResult
      }
      if (fn === "notify_organization_members") {
        return createOrganizationResult
      }
      return { data: null, error: new Error("rpc inconnu") }
    }),
    from: vi.fn((table: string) => {
      if (table === "notification_templates") {
        return selectTemplate
      }
      if (table === "notification_preferences") {
        return selectPreferences
      }
      return selectTemplate
    }),
  }
}

type Client = ReturnType<typeof client>

function makeService(admin: Client | null, server: Client | null = null) {
  return new NotificationService(
    async () => admin as never,
    async () => server as never,
  )
}

beforeEach(() => {
  mocks.isEmailConfigured.mockReset()
  mocks.isEmailConfigured.mockReturnValue(true)
})

describe("isChannelAllowed", () => {
  it("n'autorise un canal que s'il est dans le template ET activé", () => {
    expect(isChannelAllowed(generalTemplate, "in_app")).toBe(true)
    expect(isChannelAllowed(generalTemplate, "email")).toBe(true)
    expect(isChannelAllowed(generalTemplate, "push")).toBe(false)

    const disabled = templateWith({ enabled: false })
    expect(isChannelAllowed(disabled, "in_app")).toBe(false)

    const emailOnly = templateWith({ channels: ["email"] })
    expect(isChannelAllowed(emailOnly, "email")).toBe(true)
    expect(isChannelAllowed(emailOnly, "in_app")).toBe(false)
  })
})

describe("resolveEmailDelivery", () => {
  const input = {
    type: "general",
    title: "Nouvelle activité",
    body: "Quelqu'un a mis à jour le projet.",
    email: "membre@exemple.com",
  }

  it("renvoie null quand le canal email n'est pas permis par le template", () => {
    const template = templateWith({ channels: ["in_app"] })
    expect(resolveEmailDelivery(input, template, { emailEnabled: true })).toBe(
      null,
    )
  })

  it("renvoie null sans adresse email ou si la préférence est désactivée", () => {
    expect(
      resolveEmailDelivery({ ...input, email: undefined }, generalTemplate, {
        emailEnabled: true,
      }),
    ).toBeNull()
    expect(
      resolveEmailDelivery(input, generalTemplate, { emailEnabled: false }),
    ).toBeNull()
  })

  it("renvoie null si l'email n'est pas configuré (provider absent)", () => {
    expect(
      resolveEmailDelivery(input, generalTemplate, {
        emailEnabled: true,
        emailConfigured: false,
      }),
    ).toBeNull()
  })

  it("construit un descripteur éligible (in-app + email)", () => {
    const descriptor = resolveEmailDelivery(input, generalTemplate, {
      emailEnabled: true,
    })
    expect(descriptor).not.toBeNull()
    expect(descriptor?.to).toBe("membre@exemple.com")
    expect(descriptor?.referenceId).toMatch(/^general:[0-9a-f-]+$/)
    expect(descriptor?.title).toBe("Nouvelle activité")
    expect(descriptor?.actionUrl).toBeUndefined()
  })

  it("normalise un corps vide en chaîne vide (jamais undefined)", () => {
    const descriptor = resolveEmailDelivery(
      { ...input, body: undefined },
      generalTemplate,
      { emailEnabled: true },
    )
    expect(descriptor?.body).toBe("")
  })
})

describe("NotificationService", () => {
  it("lève une erreur template quand le type est inconnu", async () => {
    const service = makeService(client({ template: null } as ClientOptions))

    await expect(
      service.notify({ userId: "u1", type: "inconnu", title: "Test" }),
    ).rejects.toMatchObject({ code: "template-error" })
  })

  it("ne crée rien si le type existe mais est désactivé", async () => {
    const service = makeService(
      client({ template: templateWith({ enabled: false }) }),
    )

    await expect(
      service.notify({ userId: "u1", type: "general", title: "Test" }),
    ).rejects.toThrow(NotificationError)
  })

  it("crée la ligne in-app via RPC et ne renvoie pas d'email si la préférence est désactivée", async () => {
    const admin = client({ preferences: { enabled: false } })
    const service = makeService(admin)

    const result = await service.notify({
      userId: "u1",
      email: "membre@exemple.com",
      type: "general",
      title: "Nouvelle activité",
      body: "Un événement s'est produit.",
      data: { entity: "projet" },
    })

    expect(admin.rpc).toHaveBeenCalledWith("create_notification", {
      p_user_id: "u1",
      p_type: "general",
      p_title: "Nouvelle activité",
      p_body: "Un événement s'est produit.",
      p_organization_id: null,
      p_data: { entity: "projet" },
    })
    expect(result.notificationId).toBe("notif-1")
    expect(result.email).toBeNull()
  })

  it("renvoie un descripteur email quand la préférence est activée", async () => {
    const admin = client({ preferences: { enabled: true } })
    const service = makeService(admin)

    const result = await service.notify({
      userId: "u1",
      email: "membre@exemple.com",
      type: "general",
      title: "Nouvelle activité",
    })

    expect(result.notificationId).toBe("notif-1")
    expect(result.email?.to).toBe("membre@exemple.com")
    expect(result.email?.referenceId).toMatch(/^general:/)
  })

  it("relaie une erreur RPC sans masquer la cause", async () => {
    const service = makeService(client({ createError: true }))

    await expect(
      service.notify({ userId: "u1", type: "general", title: "Test" }),
    ).rejects.toThrow(NotificationError)
  })

  it("en mode dégradé (client serveur OK, admin absent) : pas d'in-app, email préservé", async () => {
    const server = client()
    const service = makeService(null, server)

    const result = await service.notify({
      userId: "u1",
      email: "membre@exemple.com",
      type: "general",
      title: "Local",
    })

    expect(result.notificationId).toBeNull()
    expect(result.email?.to).toBe("membre@exemple.com")
    expect(server.rpc).not.toHaveBeenCalled()
  })

  it("lève template-error quand AUCUN client n'est disponible", async () => {
    const service = makeService(null, null)

    await expect(
      service.notify({ userId: "u1", type: "general", title: "Local" }),
    ).rejects.toThrow(NotificationError)
  })

  it("notifyOrganization notifie chaque membre et retourne le compte", async () => {
    const admin = client()
    const service = makeService(admin)

    const count = await service.notifyOrganization("org-1", {
      type: "general",
      title: "Maintenance",
      body: "Prévue ce soir.",
    })

    expect(count).toBe(3)
    expect(admin.rpc).toHaveBeenCalledWith("notify_organization_members", {
      p_organization_id: "org-1",
      p_type: "general",
      p_title: "Maintenance",
      p_body: "Prévue ce soir.",
      p_data: {},
    })
  })
})