import type { ExportRow } from "./types"

/**
 * Sérialise des lignes en JSON. `pretty` permet un fichier lisible par un
 * humain (débogage, volumétrie réduite) ; par défaut la sortie est compacte.
 */
export function toJson(rows: ExportRow[], pretty = false): string {
  return JSON.stringify(rows, null, pretty ? 2 : undefined)
}