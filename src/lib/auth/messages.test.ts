import { describe, expect, it } from "vitest"

import { getSignUpErrorMessage } from "./messages"

describe("getSignUpErrorMessage", () => {
  it("traduit 'User already registered' (message brut Supabase)", () => {
    const message = getSignUpErrorMessage({
      message: "User already registered",
    })
    expect(message).toBe("Un compte existe déjà avec cette adresse email.")
  })

  it("traduit le code 'email_exists' sans dépendre du texte", () => {
    expect(
      getSignUpErrorMessage({ code: "email_exists", message: "duplicate email" }),
    ).toBe("Un compte existe déjà avec cette adresse email.")
    expect(
      getSignUpErrorMessage({ code: "user_already_exists", message: "duplicate" }),
    ).toBe("Un compte existe déjà avec cette adresse email.")
  })

  it("ne reflète jamais le message brut anglais vers l'utilisateur", () => {
    const message = getSignUpErrorMessage({
      message: "provider: internal error 503 (raw technical detail)",
      code: "unknown_code",
    })
    expect(message).toBe(
      "Une erreur est survenue lors de l'inscription. Réessaie.",
    )
  })

  it("retombe sur un message générique sans aucune information", () => {
    expect(getSignUpErrorMessage({})).toBe(
      "Une erreur est survenue lors de l'inscription. Réessaie.",
    )
  })
})