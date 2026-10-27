import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tests du Server Action « modifier un établissement ».
 *
 * Couverture :
 *   - validation serveur AVANT tout appel au service privilégié (aucune requête
 *     pour une entrée invalide) ;
 *   - aucun repli silencieux : un type non reconnu est un refus explicite ;
 *   - les réglages REGISTRA ne sont pas touchés quand le type est omis ;
 *   - l'erreur métier revient comme message honnête, jamais comme succès ;
 *   - une erreur inattendue est propagée (jamais avalée) ;
 *   - le cache n'est rafraîchi qu'après une écriture réelle.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    updatePlatformOrganization: vi.fn(),
    revalidatePath: vi.fn(),
  },
}))

vi.mock("@/lib/platform-admin/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform-admin/service")>()
  return {
    ...actual,
    updatePlatformOrganization: mocks.updatePlatformOrganization,
  }
})
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}))

import * as actions from "./actions"
import { PlatformAdminError } from "@/lib/platform-admin/service"

const { updateOrganizationAction } = actions

const VALID_ID = "3f1d2c4a-9b8e-4c7a-8f21-1234567890ab"

function makeForm(values: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

const EMPTY_STATE = { ok: false, message: "" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updatePlatformOrganization.mockResolvedValue(undefined)
})

describe("updateOrganizationAction — validation serveur", () => {
  it("refuse un identifiant non-UUID sans toucher au service", async () => {
    const state = await updateOrganizationAction(
      EMPTY_STATE,
      makeForm({ organizationId: "1; drop table organizations", name: "Nom valide" }),
    )

    expect(state.ok).toBe(false)
    expect(state.message).toMatch(/invalide/i)
    expect(mocks.updatePlatformOrganization).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("refuse un nom trop court sans toucher au service", async () => {
    const state = await updateOrganizationAction(
      EMPTY_STATE,
      makeForm({ organizationId: VALID_ID, name: "a" }),
    )

    expect(state.ok).toBe(false)
    expect(mocks.updatePlatformOrganization).not.toHaveBeenCalled()
  })

  it("refuse un type non reconnu au lieu de le remplacer silencieusement", async () => {
    const state = await updateOrganizationAction(
      EMPTY_STATE,
      makeForm({
        organizationId: VALID_ID,
        name: "Nom valide",
        organizationType: "startup",
      }),
    )

    expect(state).toEqual({ ok: false, message: "Type d'établissement invalide." })
    expect(mocks.updatePlatformOrganization).not.toHaveBeenCalled()
  })

  it("trim les entrées avant envoi", async () => {
    await updateOrganizationAction(
      EMPTY_STATE,
      makeForm({ organizationId: `  ${VALID_ID}  `, name: "  Nom trimé  " }),
    )

    expect(mocks.updatePlatformOrganization).toHaveBeenCalledWith({
      id: VALID_ID,
      name: "Nom trimé",
    })
  })
})

describe("updateOrganizationAction — réglages REGISTRA", () => {
  it("type omis ou vide → n'envoie JAMAIS organizationType (pas de création de ligne)", async () => {
    for (const organizationType of ["", "   "]) {
      vi.clearAllMocks()
      mocks.updatePlatformOrganization.mockResolvedValue(undefined)

      await updateOrganizationAction(
        EMPTY_STATE,
        makeForm({
          organizationId: VALID_ID,
          name: "Nom valide",
          organizationType,
        }),
      )

      expect(mocks.updatePlatformOrganization).toHaveBeenCalledWith({
        id: VALID_ID,
        name: "Nom valide",
      })
      const input = mocks.updatePlatformOrganization.mock.calls[0]?.[0]
      expect(Object.keys(input ?? {})).not.toContain("organizationType")
    }
  })

  it("type valide → transmis au service", async () => {
    await updateOrganizationAction(
      EMPTY_STATE,
      makeForm({
        organizationId: VALID_ID,
        name: "Nom valide",
        organizationType: "school",
      }),
    )

    expect(mocks.updatePlatformOrganization).toHaveBeenCalledWith({
      id: VALID_ID,
      name: "Nom valide",
      organizationType: "school",
    })
  })
})

describe("updateOrganizationAction — honnêteté du résultat", () => {
  it("renvoie l'erreur métier comme message, jamais un faux succès", async () => {
    mocks.updatePlatformOrganization.mockRejectedValue(
      new PlatformAdminError("not_found", "Établissement introuvable."),
    )

    const state = await updateOrganizationAction(
      EMPTY_STATE,
      makeForm({ organizationId: VALID_ID, name: "Nom valide" }),
    )

    expect(state).toEqual({ ok: false, message: "Établissement introuvable." })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("succès réel → ok + rafraîchissement du cache", async () => {
    const state = await updateOrganizationAction(
      EMPTY_STATE,
      makeForm({ organizationId: VALID_ID, name: "Nom valide" }),
    )

    expect(state).toEqual({ ok: true, message: "Établissement mis à jour." })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/organizations")
  })

  it("une erreur inattendue est propagée, jamais masquée", async () => {
    mocks.updatePlatformOrganization.mockRejectedValue(new Error("boom réseau"))

    await expect(
      updateOrganizationAction(
        EMPTY_STATE,
        makeForm({ organizationId: VALID_ID, name: "Nom valide" }),
      ),
    ).rejects.toThrow("boom réseau")

    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("n'exporte que des fonctions : invariant \"use server\" du module", () => {
    // Un export de constante ici casserait la compilation du Server Action.
    const entries = Object.entries(actions)
    expect(entries.every(([, value]) => typeof value === "function")).toBe(true)
    expect(Object.keys(actions).sort()).toEqual(["updateOrganizationAction"])
  })
})
