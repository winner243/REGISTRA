import { toCsv, toCsvCell } from "./csv"
import { ExportError } from "./errors"
import type { ChunkedExportOptions, ExportColumn, ExportRow } from "./types"

export const DEFAULT_MAX_EXPORT_ROWS = 100_000

const JSON_OPEN = "["
const JSON_CLOSE = "]"

/**
 * Convertit un `AsyncIterable` de lignes en un flux de **morceaux** (strings)
 * au format demandé, sans tout charger en mémoire :
 *
 * - **CSV** : en-tête puis une ligne par enregistrement (BOM ajouté par la
 *   couche HTTP pour la compatibilité tableurs) ;
 * - **JSON** : un tableau découpé morceau par morceau (sérialisation compacte
 *   d'enregistrement — l'option `pretty` de `toJson` reste réservée aux petits
 *   volumes chargés en mémoire).
 *
 * `maxRows` (défaut : `DEFAULT_MAX_EXPORT_ROWS`) limite le volume exporté :
 * au-delà, le flux lève une `ExportError` (`limit-exceeded`). La production
 * des lignes (pagination/batch) est entièrement à la charge de l'appelant via
 * le générateur fourni.
 */
export async function* createExportChunks(
  rows: AsyncIterable<ExportRow>,
  options: ChunkedExportOptions,
): AsyncGenerator<string> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_EXPORT_ROWS
  const columns: ExportColumn[] = options.columns ?? []

  if (maxRows <= 0) {
    throw new ExportError("limit-exceeded", "Limite d'export invalide.")
  }

  if (options.format === "json") {
    yield JSON_OPEN
  } else {
    yield toCsv([], columns) + "\r\n"
  }

  let count = 0

  for await (const row of rows) {
    if (count >= maxRows) {
      throw new ExportError(
        "limit-exceeded",
        `Export limité à ${maxRows} lignes.`,
      )
    }

    if (options.format === "json") {
      yield (count === 0 ? "" : ",") + JSON.stringify(row)
    } else {
      yield columns.map((column) => toCsvCell(row[column.key])).join(",") + "\r\n"
    }

    count += 1
  }

  if (options.format === "json") {
    yield JSON_CLOSE
  }
}