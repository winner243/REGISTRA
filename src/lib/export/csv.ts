import type { ExportColumn, ExportRow } from "./types"

export const CSV_BOM = "\uFEFF"

const FORMULA_CHARS = ["=", "+", "-", "@"]
const INJECTION_NEUTRALIZER = "'"

function isFormulaStart(value: string): boolean {
  const first = value.charAt(0)
  return FORMULA_CHARS.includes(first) || first === "\t" || first === "\r"
}

/**
 * Pré-vient l'injection de formule (CSV injection / formula injection) :
 * une cellule débutant par `=`, `+`, `-`, `@` (ou tabulation/retour) est
 * neutralisée en la préfixant par une apostrophe afin qu'Excel / Sheets ne
 * l'interprète pas comme une formule (`=cmd`, `HYPERLINK`, `SUM(...)`…).
 */
export function neutralizeCsvValue(value: string): string {
  if (isFormulaStart(value)) {
    return INJECTION_NEUTRALIZER + value
  }
  return value
}

/**
 * Sérialise une valeur en cellule CSV (RFC 4180) :
 * - `null`/`undefined` → cellule vide ;
 * - booléen → `true`/`false` ;
 * - date → ISO 8601 ;
 * - chaînes : neutralisation des formules puis échappement des `"`, virgules
 *   et sauts de ligne entre guillemets.
 */
export function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  const stringValue = String(value)

  if (typeof value === "string") {
    const neutralized = neutralizeCsvValue(stringValue)
    if (
      neutralized.includes(",") ||
      neutralized.includes('"') ||
      neutralized.includes("\n") ||
      neutralized.includes("\r")
    ) {
      return `"${neutralized.replaceAll('"', '""')}"`
    }
    return neutralized
  }

  return stringValue
}

/**
 * Sérialise des lignes en CSV. Seules les colonnes listées dans `columns`
 * sont exportées : aucune donnée hors liste ne peut fuiter.
 * Terminaisons de ligne `\r\n` (attendu par Excel).
 */
export function toCsv(rows: ExportRow[], columns: ExportColumn[]): string {
  const header = columns.map((column) => toCsvCell(column.header)).join(",")
  const lines = rows.map((row) =>
    columns.map((column) => toCsvCell(row[column.key])).join(","),
  )
  return [header, ...lines].join("\r\n")
}