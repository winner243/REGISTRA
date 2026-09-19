import { describe, expect, it } from "vitest"
import { safeNextPath, getBaseUrlFromHeaders } from "./url"

describe("safeNextPath", () => {
  it("accepte les chemins locaux simples", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard")
    expect(safeNextPath("/dashboard/settings")).toBe("/dashboard/settings")
    expect(safeNextPath("/")).toBe("/")
  })

  it("rejette les URLs absolues", () => {
    expect(safeNextPath("http://evil.com")).toBeNull()
    expect(safeNextPath("https://evil.com/path")).toBeNull()
  })

  it("rejette les protocoles-relative", () => {
    expect(safeNextPath("//evil.com")).toBeNull()
    expect(safeNextPath("//evil.com/path")).toBeNull()
  })

  it("rejette les null bytes", () => {
    expect(safeNextPath("/path\x00evil")).toBeNull()
    expect(safeNextPath("/\x00")).toBeNull()
  })

  it("rejette les retours chariot et sauts de ligne", () => {
    expect(safeNextPath("/path\revil")).toBeNull()
    expect(safeNextPath("/path\nevil")).toBeNull()
    expect(safeNextPath("/path\r\n")).toBeNull()
  })

  it("rejette les backslashes", () => {
    expect(safeNextPath("/\\evil.com")).toBeNull()
    expect(safeNextPath("/path\\evil")).toBeNull()
  })

  it("rejette les valeurs vides ou null", () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath(undefined)).toBeNull()
    expect(safeNextPath("")).toBeNull()
  })

  it("rejette les valeurs sans slash initial", () => {
    expect(safeNextPath("dashboard")).toBeNull()
    expect(safeNextPath("relative/path")).toBeNull()
  })
})

describe("getBaseUrlFromHeaders", () => {
  it("utilise NEXT_PUBLIC_APP_URL quand configurée", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL
    try {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com"
      const headers = { get: () => "https://evil.com" }
      expect(getBaseUrlFromHeaders(headers)).toBe("https://app.example.com")
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = original
    }
  })

  it("fallback sur origin header quand pas de config", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL
    try {
      delete process.env.NEXT_PUBLIC_APP_URL
      const headers = { get: () => "https://from-header.com" }
      expect(getBaseUrlFromHeaders(headers)).toBe("https://from-header.com")
    } finally {
      if (original !== undefined) process.env.NEXT_PUBLIC_APP_URL = original
    }
  })

  it("fallback localhost quand ni config ni header", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL
    try {
      delete process.env.NEXT_PUBLIC_APP_URL
      const headers = { get: () => null }
      expect(getBaseUrlFromHeaders(headers)).toBe("http://localhost:3000")
    } finally {
      if (original !== undefined) process.env.NEXT_PUBLIC_APP_URL = original
    }
  })
})
