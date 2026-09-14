import { describe, expect, it } from "vitest"

import {
  buildExportFileName,
  contentDispositionAttachment,
  createExportChunks,
  CSV_BOM,
  ensureCanExport,
  ExportError,
  exportErrorToHttpStatus,
  neutralizeCsvValue,
  slugifyFileName,
  toCsv,
  toCsvCell,
  toJson,
} from "./index"

async function* toAsync(rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    yield row
  }
}

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  const parts: string[] = []
  for await (const chunk of chunks) {
    parts.push(chunk)
  }
  return parts.join("")
}

describe("toCsvCell", () => {
  it("laisse les cellules vides pour null et undefined", () => {
    expect(toCsvCell(null)).toBe("")
    expect(toCsvCell(undefined)).toBe("")
  })

  it("sérialise booléens et dates de façon stable", () => {
    expect(toCsvCell(true)).toBe("true")
    expect(toCsvCell(false)).toBe("false")
    expect(toCsvCell(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z")
  })

  it("échappe virgules, guillemets et sauts de ligne", () => {
    expect(toCsvCell('a,b')).toBe('"a,b"')
    expect(toCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(toCsvCell("ligne1\nligne2")).toBe('"ligne1\nligne2"')
  })

  it("neutralise l'injection de formule", () => {
    expect(neutralizeCsvValue("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)")
    expect(neutralizeCsvValue("+cmd")).toBe("'+cmd")
    expect(neutralizeCsvValue("-2+3")).toBe("'-2+3")
    expect(neutralizeCsvValue("@hyperlink")).toBe("'@hyperlink")
    expect(neutralizeCsvValue("\tindent")).toBe("'\tindent")
    expect(neutralizeCsvValue("normal")).toBe("normal")
    expect(toCsvCell("=1+1")).toBe("'=1+1")
  })

  it("n'altère pas les nombres ni le BOM zip", () => {
    expect(toCsvCell(42)).toBe("42")
    expect(toCsvCell(3.14)).toBe("3.14")
  })
})

describe("toCsv", () => {
  it("sérialise l'en-tête puis les lignes", () => {
    const csv = toCsv(
      [
        { id: 1, name: "Ada" },
        { id: 2, name: "Grace" },
      ],
      [
        { key: "id", header: "ID" },
        { key: "name", header: "Nom" },
      ],
    )
    expect(csv).toBe("ID,Nom\r\n1,Ada\r\n2,Grace")
  })

  it("n'exporte que les colonnes déclarées (projection)", () => {
    const csv = toCsv(
      [{ id: 1, name: "Ada", secret: "hidden" }],
      [{ key: "id", header: "ID" }],
    )
    expect(csv).toBe("ID\r\n1")
    expect(csv).not.toContain("hidden")
  })
})

describe("toJson", () => {
  it("sérialise compact par défaut et pretty en option", () => {
    expect(toJson([{ a: 1 }])).toBe('[{"a":1}]')
    expect(toJson([{ a: 1 }], true)).toBe('[\n  {\n    "a": 1\n  }\n]')
  })
})

describe("buildExportFileName / slugifyFileName", () => {
  it("crée un nom de fichier sûr avec la date", () => {
    const date = new Date("2026-09-07T10:00:00Z")
    expect(buildExportFileName("Liste des contacts", "csv", date)).toBe(
      "liste-des-contacts-2026-09-07.csv",
    )
    expect(buildExportFileName("Réservations 2026", "json", date)).toBe(
      "reservations-2026-2026-09-07.json",
    )
  })

  it("neutralise les caractères dangereux pour un chemin", () => {
    expect(slugifyFileName("../etc/passwd")).toBe("etc-passwd")
    expect(slugifyFileName("../../..")).toBe("export")
    expect(slugifyFileName("")).toBe("export")
    expect(slugifyFileName("UN Nom Accentué")).toBe("un-nom-accentue")
  })

  it("produit un Content-Disposition RFC 5987", () => {
    const cd = contentDispositionAttachment("résultats 2026.csv")
    expect(cd).toContain('attachment; filename="r')
    expect(cd).toContain("filename*=UTF-8''")
    expect(cd).toContain(encodeURIComponent("résultats 2026.csv"))
  })
})

describe("ensureCanExport", () => {
  it("refuse sans utilisateur (unauthorized)", async () => {
    await expect(ensureCanExport(null)).rejects.toMatchObject({ code: "unauthorized" })
    await expect(ensureCanExport(undefined)).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("refuse un utilisateur non autorisé (forbidden)", async () => {
    await expect(ensureCanExport("u1", () => false)).rejects.toMatchObject({
      code: "forbidden",
    })
  })

  it("autorise un utilisateur autorisé", async () => {
    await expect(ensureCanExport("u1", () => true)).resolves.toBeUndefined()
  })

  it("autorise sans contrôle fourni (identité seule)", async () => {
    await expect(ensureCanExport("u1")).resolves.toBeUndefined()
  })
})

describe("createExportChunks", () => {
  const columns = [
    { key: "id", header: "ID" },
    { key: "label", header: "Libellé" },
  ]

  it("produit un CSV complet morceaux compris", async () => {
    const output = await collect(
      createExportChunks(
        toAsync([
          { id: 1, label: "A" },
          { id: 2, label: "B" },
        ]),
        { format: "csv", columns },
      ),
    )
    expect(output).toBe("ID,Libellé\r\n1,A\r\n2,B\r\n")
  })

  it("neutralise les formules dans les données exportées", async () => {
    const output = await collect(
      createExportChunks(toAsync([{ id: 1, label: "=X()" }]), {
        format: "csv",
        columns,
      }),
    )
    expect(output).toContain("'=X()")
  })

  it("produit un tableau JSON valide", async () => {
    const output = await collect(
      createExportChunks(
        toAsync([
          { id: 1, label: "A" },
          { id: 2, label: "B" },
        ]),
        { format: "json", columns },
      ),
    )
    expect(JSON.parse(output)).toEqual([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
    ])
  })

  it("respecte maxRows exactement sans erreur", async () => {
    const output = await collect(
      createExportChunks(toAsync([{ id: 1 }, { id: 2 }]), {
        format: "json",
        maxRows: 2,
      }),
    )
    expect(JSON.parse(output)).toHaveLength(2)
  })

  it("lève limit-exceeded au-delà de maxRows", async () => {
    await expect(
      collect(
        createExportChunks(toAsync([{ id: 1 }, { id: 2 }, { id: 3 }]), {
          format: "csv",
          columns,
          maxRows: 2,
        }),
      ),
    ).rejects.toMatchObject({ code: "limit-exceeded" })
  })

  it("lève ExportError pour maxRows invalide ou format refusé", async () => {
    await expect(
      collect(
        createExportChunks(toAsync([{ id: 1 }]), { format: "json", maxRows: 0 }),
      ),
    ).rejects.toBeInstanceOf(ExportError)
  })
})

describe("exportErrorToHttpStatus", () => {
  it("mappe chaque code vers son statut", () => {
    expect(exportErrorToHttpStatus("unauthorized")).toBe(401)
    expect(exportErrorToHttpStatus("forbidden")).toBe(403)
    expect(exportErrorToHttpStatus("invalid-format")).toBe(415)
    expect(exportErrorToHttpStatus("limit-exceeded")).toBe(413)
  })
})

describe("CSV_BOM", () => {
  it("est le BOM UTF-8", () => {
    expect(CSV_BOM).toBe("\uFEFF")
  })
})