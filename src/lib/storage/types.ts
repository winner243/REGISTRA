export const STORAGE_BUCKETS = {
  PUBLIC: "saas_public",
  PRIVATE: "saas_private",
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

export function isStorageBucket(value: string): value is StorageBucket {
  return value === STORAGE_BUCKETS.PUBLIC || value === STORAGE_BUCKETS.PRIVATE
}

export interface StorableFile {
  name: string
  type: string
  size: number
  bytes: ArrayBuffer
}

export interface UploadFileInput {
  organizationId: string
  bucket: StorageBucket
  file: StorableFile
  /** Id de l'utilisateur qui uploade (audit, transmis par l'action serveur). */
  uploadedBy: string
}

export interface StorageFileRecord {
  id: string
  organization_id: string
  bucket: StorageBucket
  storage_path: string
  name: string
  mime_type: string
  size_bytes: number
  checksum_sha256: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type StorageErrorCode =
  | "internal"
  | "invalid-request"
  | "file-type-not-allowed"
  | "file-too-large"
  | "not-found"

export class StorageError extends Error {
  readonly code: StorageErrorCode

  constructor(
    code: StorageErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message)
    this.name = "StorageError"
    this.code = code
    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}