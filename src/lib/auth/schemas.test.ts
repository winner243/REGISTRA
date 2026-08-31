import { describe, expect, it } from "vitest"

import { loginSchema, signUpSchema, resetPasswordSchema } from "./schemas"

describe("loginSchema", () => {
  it("valide un couple email + mot de passe", () => {
    const parsed = loginSchema.parse({
      email: "USER@Example.com",
      password: "motdepasse",
    })
    expect(parsed.email).toBe("user@example.com")
  })

  it("rejette une entrée incomplète", () => {
    expect(loginSchema.safeParse({ email: "user@example.com" }).success).toBe(
      false,
    )
  })
})

describe("signUpSchema", () => {
  it("accepte une inscription quand les mots de passe correspondent", () => {
    const parsed = signUpSchema.parse({
      email: "user@example.com",
      password: "motdepasse",
      confirmPassword: "motdepasse",
    })
    expect(parsed.email).toBe("user@example.com")
  })

  it("rejette un mot de passe qui ne correspond pas à la confirmation", () => {
    const result = signUpSchema.safeParse({
      email: "user@example.com",
      password: "motdepasse",
      confirmPassword: "autre",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("confirmPassword")
    }
  })
})

describe("resetPasswordSchema", () => {
  it("accepte un nouveau mot de passe confirmé", () => {
    const parsed = resetPasswordSchema.parse({
      password: "nouveaumotdepasse",
      confirmPassword: "nouveaumotdepasse",
    })
    expect(parsed.password).toBe("nouveaumotdepasse")
  })

  it("rejette une non-correspondance", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "motdepasse",
        confirmPassword: "different",
      }).success,
    ).toBe(false)
  })
})
