/**
 * Chemins d'objets Storage : format rigide `orgs/<organization_id>/...`
 * (le trigger `enforce_storage_file_path` l'impose en base).
 */

const ORG_PATH_PREFIX = "orgs"

/** Slug lisible pour le nom du fichier (accentuations et espaces retirés). */
export function slugifyFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "")
  const slug = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return slug.slice(0, 80)
}

/**
 * Chemin d'objet d'un upload : `orgs/<org>/<id>-<slug>`. L'id d'oject est
 * injectable pour des tests déterministes.
 */
export function buildStoragePath(
  organizationId: string,
  fileName: string,
  objectId: string = crypto.randomUUID(),
): string {
  const slug = slugifyFileName(fileName) || "fichier"
  return `${ORG_PATH_PREFIX}/${organizationId}/${objectId}-${slug}`
}

/** Extrait l'id d'organisation d'un chemin (null si format non conforme). */
export function storagePathOrganization(
  storagePath: string,
): string | null {
  const match = storagePath.match(/^orgs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\//)
  return match ? match[1] : null
}