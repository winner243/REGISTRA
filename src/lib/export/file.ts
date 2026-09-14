import type { ExportFormat } from "./types"

const EXTENSIONS: Record<ExportFormat, string> = {
  csv: "csv",
  json: "json",
}

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
}

/**
 * Nettrie un libellé en slug sûr pour un nom de fichier : minuscules,
 * caractères alphanumériques uniquement (ASCII), tirets entre les mots.
 */
export function slugifyFileName(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")

  return slug || "export"
}

/**
 * Construit un nom de fichier déterministe et sûr :
 * `<libellé>-<année>-<mois>-<jour>.<ext>`. Le libellé ne vient jamais du
 * client tel quel : il est normalisé (slug) pour empêcher tout contournement
 * de chemin (`../`, séparateurs…).
 */
export function buildExportFileName(
  label: string,
  format: ExportFormat,
  date = new Date(),
): string {
  const extension = EXTENSIONS[format]
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${slugifyFileName(label)}-${yyyy}-${mm}-${dd}.${extension}`
}

/**
 * Header `Content-Disposition` pour un téléchargement : fallback ASCII
 * (`filename`) + forme RFC 5987 (`filename*`) pour les caractères non ASCII.
 */
export function contentDispositionAttachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_")
  const encoded = encodeURIComponent(fileName)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}