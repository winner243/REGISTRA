import { describe, expect, it } from "vitest"

import {
  emailSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  priceSchema,
  userProfileSchema,
} from "./schemas"

describe("emailSchema", () => {
  it("accepte un email valide et le normalise (trim + minuscules)", () => {
    expect(emailSchema.parse("  User@Example.COM  ")).toBe("user@example.com")
  })

  it("rejette un email invalide", () => {
    expect(emailSchema.safeParse("pas-un-email").success).toBe(false)
    expect(emailSchema.safeParse("a@b").success).toBe(false)
  })
})

describe("nameSchema", () => {
  it("accepte un nom valide et le nettoie", () => {
    expect(nameSchema.parse("  Marie  ")).toBe("Marie")
  })

  it("rejette un nom trop court ou trop long", () => {
    expect(nameSchema.safeParse("a").success).toBe(false)
    expect(nameSchema.safeParse("x".repeat(121)).success).toBe(false)
  })
})

describe("priceSchema", () => {
  it("accepte un prix strictement positif et fini", () => {
    expect(priceSchema.parse(19.99)).toBe(19.99)
  })

  it("rejette zero, un negatif et NaN/Infinity", () => {
    expect(priceSchema.safeParse(0).success).toBe(false)
    expect(priceSchema.safeParse(-5).success).toBe(false)
    expect(priceSchema.safeParse(Number.NaN).success).toBe(false)
    expect(priceSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false)
  })
})

describe("phoneSchema", () => {
  it("accepte des formats internationaux", () => {
    expect(phoneSchema.parse("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78")
    expect(phoneSchema.safeParse("0612345678").success).toBe(true)
  })

  it("rejette une chaîne non numérique", () => {
    expect(phoneSchema.safeParse("abc").success).toBe(false)
  })
})

describe("passwordSchema", () => {
  it("accepte un mot de passe de 8 caractères ou plus", () => {
    expect(passwordSchema.safeParse("motsdepasse").success).toBe(true)
  })

  it("rejette un mot de passe trop court", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false)
  })
})

describe("userProfileSchema", () => {
  it("valide un profil complet ; le téléphone est optionnel", () => {
    const full = userProfileSchema.parse({
      name: "Marie Dupont",
      email: "marie@example.com",
      phone: "+33612345678",
    })
    expect(full.phone).toBe("+33612345678")

    const withoutPhone = userProfileSchema.parse({
      name: "Marie Dupont",
      email: "marie@example.com",
    })
    expect(withoutPhone.phone).toBeUndefined()
  })

  it("rejette un profil si l'email est invalide", () => {
    expect(
      userProfileSchema.safeParse({
        name: "Marie Dupont",
        email: "invalide",
      }).success,
    ).toBe(false)
  })
})
