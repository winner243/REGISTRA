import { describe, expect, it } from "vitest"

import { getFirstErrorMessage } from "./errors"
import { emailSchema, passwordSchema } from "./schemas"

describe("getFirstErrorMessage", () => {
  it("retourne null quand le parsing réussit", () => {
    const result = emailSchema.safeParse("user@example.com")
    expect(result.success).toBe(true)
    if (result.success) {
      expect(getFirstErrorMessage(result)).toBeNull()
    }
  })

  it("retourne le premier message d'erreur lisible", () => {
    const result = emailSchema.safeParse("invalide")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(getFirstErrorMessage(result)).toMatch(/email/i)
    }
  })

  it("retourne un message pour une erreur Zod de mot de passe", () => {
    const result = passwordSchema.safeParse("court")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(getFirstErrorMessage(result)).toMatch(/8 caract/iu)
    }
  })
})
