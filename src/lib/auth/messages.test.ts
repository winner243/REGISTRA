import { describe, expect, it } from "vitest"

import { getSignUpErrorMessage } from "./messages"

describe("getSignUpErrorMessage", () => {
  it("retourne toujours le même message pour éviter l'énumération de comptes", () => {
    const expected = "Si un compte existe déjà avec cette adresse, un email de confirmation a été envoyé."

    expect(getSignUpErrorMessage({ message: "User already registered" })).toBe(expected)
    expect(getSignUpErrorMessage({ code: "email_exists", message: "duplicate email" })).toBe(expected)
    expect(getSignUpErrorMessage({ code: "user_already_exists", message: "duplicate" })).toBe(expected)
    expect(getSignUpErrorMessage({ message: "provider: internal error 503", code: "unknown_code" })).toBe(expected)
    expect(getSignUpErrorMessage({})).toBe(expected)
  })
})
