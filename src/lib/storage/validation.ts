import { StorageError } from "./types"

/** Limite d'upload par défaut (10 Mo) — pilotée côté serveur, jamais client. */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Plafond physique de la colonne `storage_files.size_bytes` (5 GiB). */
export const STORAGE_HARD_LIMIT_BYTES = 5 * 1024 * 1024 * 1024

/**
 * Types MIME autorisés à l'upload. Liste REFUSÉE par défaut : pas de SVG
 * (XSS via labels/scripts), pas d'HTML, pas d'exécutables. Chaque SaaS étend
 * ou restreint cette liste selon son domaine (migration / config).
 */
export const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
] as const

export interface UploadLimits {
  maxBytes: number
  allowedMimeTypes: string[]
}

/** Limites effectives : la valeur d'env prévaut, bornée par la limite DB. */
export function getUploadLimits(
  env: Record<string, string | number | bigint | undefined> = process.env,
): UploadLimits {
  // Supporte les deux noms de variable (config centralisée et legacy)
  const fromEnv = Number(env.STORAGE_MAX_UPLOAD_SIZE ?? env.STORAGE_MAX_UPLOAD_BYTES)
  const maxBytes =
    Number.isFinite(fromEnv) && fromEnv > 0
      ? Math.min(fromEnv, STORAGE_HARD_LIMIT_BYTES)
      : DEFAULT_MAX_UPLOAD_BYTES
  return { maxBytes, allowedMimeTypes: [...DEFAULT_ALLOWED_MIME_TYPES] }
}

/**
 * Désinfection du nom : supprime séparateurs de chemin et caractères de
 * contrôle, borne à 255 caractères. Retourne "" si le nom est inutilisable.
 */
export function sanitizeFileName(raw: string): string {
  const trimmed = raw?.trim() ?? ""
  if (!trimmed) {
    return ""
  }
  const cleaned = trimmed
    .split(/[\\/:*?"<>|\u0000-\u001f]+/)
    .filter(Boolean)
    .join("_")
  if (!cleaned) {
    return ""
  }
  return cleaned.slice(0, 255)
}

/**
 * Normalise un type MIME : minuscules et forme simple `type/subtype`,
 * sinon null (type client inexploitable → on n'upload pas).
 */
export function normalizeMimeType(raw: string): string | null {
  const value = raw?.trim().toLowerCase() ?? ""
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value)) {
    return null
  }
  return value.slice(0, 120)
}

export interface ValidatedUpload {
  name: string
  mimeType: string
  sizeBytes: number
}

/**
 * Validation SERVEUR de l'upload : taille > 0 et ≤ limite, type MIME dans la
 * liste autorisée (normalisé), nom désinfecté. Lève `StorageError` sinon.
 */
export function validateFileUpload(
  file: Pick<StorableFileCompat, "name" | "type" | "size">,
  limits: UploadLimits = getUploadLimits(),
): ValidatedUpload {
  const name = sanitizeFileName(file.name)
  if (!name) {
    throw new StorageError(
      "invalid-request",
      "Nom de fichier invalide ou vide.",
    )
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new StorageError("invalid-request", "Le fichier est vide.")
  }
  if (file.size > limits.maxBytes) {
    throw new StorageError(
      "file-too-large",
      "Fichier trop volumineux (maximum autorisé : 10 Mo).",
    )
  }

  const mimeType = normalizeMimeType(file.type)
  if (!mimeType || !limits.allowedMimeTypes.includes(mimeType)) {
    throw new StorageError(
      "file-type-not-allowed",
      "Type de fichier non autorisé.",
    )
  }

  return { name, mimeType, sizeBytes: Math.floor(file.size) }
}

// Minimise la surface de couplage du type importé (évite un import circulaire).
interface StorableFileCompat {
  name: string
  type: string
  size: number
}