import type { SupabaseClient } from "@supabase/supabase-js"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  isStorageBucket,
  STORAGE_BUCKETS,
  StorageError,
  type StorageFileRecord,
  type UploadFileInput,
} from "./types"
import { validateFileUpload } from "./validation"
import { buildStoragePath } from "./path"

export function toStorageFileRecord(row: Record<string, unknown>): StorageFileRecord {
  const bucket = String(row.bucket)
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    bucket: isStorageBucket(bucket) ? bucket : STORAGE_BUCKETS.PRIVATE,
    storage_path: String(row.storage_path),
    name: String(row.name),
    mime_type: String(row.mime_type),
    size_bytes: Number(row.size_bytes),
    checksum_sha256: String(row.checksum_sha256),
    uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export interface AccessInfo {
  url: string
  /** true = URL signée à durée courte (bucket privé) ; false = URL publique. */
  signed: boolean
  expiresInSeconds: number | null
}

/**
 * Service de stockage côté serveur. TOUTES les opérations passent par le
 * client `service_role` : le navigateur n'écrit (resp. ne supprime) jamais
 * directement dans Storage. Les autorisations (RBAC) ont été vérifiées en
 * amont par l'appelant.
 */
export class StorageService {
  constructor(
    private readonly getAdmin: () => Promise<SupabaseClient | null> = createSupabaseAdminClient,
  ) {}

  private async requireAdmin(): Promise<SupabaseClient> {
    const admin = await this.getAdmin()
    if (!admin) {
      throw new StorageError(
        "internal",
        "Le stockage de fichiers n'est pas configuré (clé service_role absente).",
      )
    }
    return admin
  }

  /** Upload validé (taille/type/nom) + insertion des métadonnées. */
  async upload(input: UploadFileInput): Promise<StorageFileRecord> {
    const validated = validateFileUpload(input.file)
    const storagePath = buildStoragePath(
      input.organizationId,
      validated.name,
    )
    const checksum = await sha256Hex(input.file.bytes)

    const admin = await this.requireAdmin()

    const { error: uploadError } = await admin.storage
      .from(input.bucket)
      .upload(storagePath, input.file.bytes, {
        contentType: validated.mimeType,
        upsert: false,
      })
    if (uploadError) {
      throw new StorageError("internal", "Impossible d'uploader le fichier.", {
        cause: uploadError,
      })
    }

    try {
      const { data, error } = await admin
        .from("storage_files")
        .insert({
          organization_id: input.organizationId,
          bucket: input.bucket,
          storage_path: storagePath,
          name: validated.name,
          mime_type: validated.mimeType,
          size_bytes: validated.sizeBytes,
          checksum_sha256: checksum,
          uploaded_by: input.uploadedBy,
        })
        .select()
        .single()
      if (error) {
        throw new StorageError(
          "internal",
          "Enregistrement des métadonnées impossible.",
          { cause: error },
        )
      }
      return toStorageFileRecord(data)
    } catch (error) {
      // Nettoyage : l'objet uploadé ne doit pas rester orphelin d'un échec
      // de métadonnées (mieux vaut ne rien avoir que des fichiers perdus).
      await admin.storage.from(input.bucket).remove([storagePath])
      if (error instanceof StorageError) {
        throw error
      }
      throw new StorageError("internal", "Échec de l'upload.", { cause: error })
    }
  }

  /**
   * URL d'accès : publique pour `saas_public`, signée (durée courte) pour
   * `saas_private`. La génération passe toujours par le serveur, jamais par
   * le navigateur (les clés de service ne quittent pas le serveur).
   */
  async getAccessUrl(
    record: Pick<StorageFileRecord, "bucket" | "storage_path">,
    options: { expiresInSeconds?: number } = {},
  ): Promise<AccessInfo> {
    const admin = await this.requireAdmin()

    if (record.bucket === STORAGE_BUCKETS.PUBLIC) {
      const { data } = admin.storage
        .from(record.bucket)
        .getPublicUrl(record.storage_path)
      return { url: data.publicUrl, signed: false, expiresInSeconds: null }
    }

    const expiresInSeconds = Math.min(
      Math.max(options.expiresInSeconds ?? 300, 60),
      3600,
    )
    const { data, error } = await admin.storage
      .from(record.bucket)
      .createSignedUrl(record.storage_path, expiresInSeconds)
    if (error) {
      throw new StorageError("internal", "Génération de l'accès impossible.", {
        cause: error,
      })
    }
    return { url: data.signedUrl, signed: true, expiresInSeconds }
  }

  /** Supprime l'objet ET ses métadonnées (ordre : objet d'abord). */
  async remove(
    record: Pick<StorageFileRecord, "id" | "bucket" | "storage_path">,
  ): Promise<void> {
    const admin = await this.requireAdmin()

    const { error: removeError } = await admin.storage
      .from(record.bucket)
      .remove([record.storage_path])
    if (removeError) {
      throw new StorageError("internal", "Suppression du fichier impossible.", {
        cause: removeError,
      })
    }

    // Suppression de métadonnées en best-effort : une ligne orpheline est
    // inoffensive (aucun objet associé), l'inverse ne l'est pas.
    await admin.from("storage_files").delete().eq("id", record.id)
  }
}

/** Instance partagée du service de stockage (clients `service_role`). */
export const storageService = new StorageService()