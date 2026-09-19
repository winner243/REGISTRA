"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/auth/session"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { RbacError, requirePermission } from "@/lib/rbac"
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit/guard"
import { rateLimitPresets } from "@/lib/rate-limit/config"
import {
  isStorageBucket,
  StorageError,
  STORAGE_BUCKETS,
  type StorageFileRecord,
} from "@/lib/storage/types"
import { storageService, toStorageFileRecord } from "@/lib/storage/service"

export type StorageActionResult =
  | {
      ok: true
      file: {
        id: string
        name: string
        sizeBytes: number
        mimeType: string
      }
    }
  | {
      ok: true
      access: { url: string; signed: boolean; expiresInSeconds: number | null }
      fileName: string
    }
  | { ok: false; error: string }
  | { ok: true; success: string }

function unauthorized(): StorageActionResult {
  return { ok: false, error: "Connectez-vous pour gérer les fichiers." }
}

function storageFailure(error: StorageError): StorageActionResult {
  switch (error.code) {
    case "invalid-request":
      return { ok: false, error: error.message }
    case "file-too-large":
      return { ok: false, error: "Fichier trop volumineux (max 10 Mo)." }
    case "file-type-not-allowed":
      return { ok: false, error: "Type de fichier non autorisé." }
    default:
      return { ok: false, error: "Impossible d'enregistrer le fichier." }
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

/** Charge un fichier visible par l'utilisateur courant (RLS `storage.read`). */
async function loadVisibleFile(fileId: string): Promise<StorageFileRecord | null> {
  if (!isUuid(fileId)) {
    return null
  }
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase
    .from("storage_files")
    .select("*")
    .eq("id", fileId)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  return toStorageFileRecord(data)
}

/**
 * Upload côté serveur (validation taille/type + droits + rate limit ici).
 * Le navigateur ne parle jamais directement à Storage.
 */
export async function uploadFileAction(
  _prev: unknown,
  formData: FormData,
): Promise<StorageActionResult> {
  const user = await getCurrentUser()
  if (!user) {
    return unauthorized()
  }

  const organizationId = String(formData.get("organizationId") ?? "")
  const bucket = String(formData.get("bucket") ?? STORAGE_BUCKETS.PRIVATE)
  if (!organizationId) {
    return { ok: false, error: "Organisation manquante." }
  }
  if (!isStorageBucket(bucket)) {
    return { ok: false, error: "Destination de stockage inconnue." }
  }

  try {
    assertRateLimit({
      key: `upload:user:${user.id}`,
      rule: rateLimitPresets.upload,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, error: error.message }
    }
    throw error
  }

  try {
    await requirePermission(organizationId, "storage.write")
  } catch (error) {
    if (error instanceof RbacError) {
      return {
        ok: false,
        error:
          error.code === "unauthorized"
            ? "Connectez-vous pour uploader un fichier."
            : "Vous n'avez pas la permission d'uploader dans cette organisation.",
      }
    }
    throw error
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { ok: false, error: "Aucun fichier sélectionné." }
  }

  try {
    const bytes = await file.arrayBuffer()
    const record = await storageService.upload({
      organizationId,
      bucket,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        bytes,
      },
      uploadedBy: user.id,
    })
    return {
      ok: true,
      file: {
        id: record.id,
        name: record.name,
        sizeBytes: record.size_bytes,
        mimeType: record.mime_type,
      },
    }
  } catch (error) {
    if (error instanceof StorageError) {
      return storageFailure(error)
    }
    throw error
  }
}

/** Supprime un fichier (permission `storage.delete` exigée côté serveur). */
export async function deleteFileAction(
  fileId: string,
): Promise<StorageActionResult> {
  const user = await getCurrentUser()
  if (!user) {
    return unauthorized()
  }

  const record = await loadVisibleFile(fileId)
  if (!record) {
    return { ok: false, error: "Fichier introuvable." }
  }

  try {
    await requirePermission(record.organization_id, "storage.delete")
  } catch (error) {
    if (error instanceof RbacError) {
      return {
        ok: false,
        error:
          error.code === "unauthorized"
            ? "Connectez-vous pour supprimer un fichier."
            : "Vous n'avez pas la permission de supprimer ce fichier.",
      }
    }
    throw error
  }

  try {
    await storageService.remove({
      id: record.id,
      bucket: record.bucket,
      storage_path: record.storage_path,
    })
  } catch (error) {
    if (error instanceof StorageError) {
      return { ok: false, error: "Suppression du fichier impossible." }
    }
    throw error
  }

  revalidatePath("/dashboard/settings")
  return { ok: true, success: "Fichier supprimé." }
}

/**
 * URL d'accès (publique ou signée) pour un fichier. Autorisation : la
 * visibilité (RLS `storage.read`) suffit à ouvrir le fichier.
 */
export async function getDownloadUrlAction(
  fileId: string,
): Promise<StorageActionResult> {
  const user = await getCurrentUser()
  if (!user) {
    return unauthorized()
  }

  const record = await loadVisibleFile(fileId)
  if (!record) {
    return { ok: false, error: "Fichier introuvable." }
  }

  try {
    const access = await storageService.getAccessUrl(record)
    return {
      ok: true,
      access: {
        url: access.url,
        signed: access.signed,
        expiresInSeconds: access.expiresInSeconds,
      },
      fileName: record.name,
    }
  } catch (error) {
    if (error instanceof StorageError) {
      return { ok: false, error: "Impossible de générer l'accès au fichier." }
    }
    throw error
  }
}