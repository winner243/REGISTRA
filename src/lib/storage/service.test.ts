import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_MAX_UPLOAD_BYTES,
  getUploadLimits,
  normalizeMimeType,
  sanitizeFileName,
  validateFileUpload,
} from "./validation"
import { buildStoragePath, slugifyFileName, storagePathOrganization } from "./path"
import { StorageError } from "./types"
import { sha256Hex, StorageService } from "./service"

const BYTES = new TextEncoder().encode("contenu du fichier").buffer

function fileData(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return {
    name: "rapport.pdf",
    type: "application/pdf",
    size: BYTES.byteLength,
    ...overrides,
  }
}

interface AdminOptions {
  uploadError?: unknown
  insertError?: unknown
  removeError?: unknown
  signedUrl?: string
  publicUrl?: string
}

function makeAdmin(options: AdminOptions = {}) {
  const {
    uploadError = null,
    insertError = null,
    removeError = null,
    signedUrl = "https://cdn/signed",
    publicUrl = "https://cdn/public",
  } = options

  // Singletons : les mêmes vi.fn sont réutilisés à chaque from()/storage.from()
  // pour pouvoir inspecter les appels depuis le test.
  const upload = vi.fn(
    async (
      _path: string,
      _body: ArrayBuffer | string,
      _options: { contentType?: string },
    ) =>
      uploadError
        ? { data: null, error: uploadError }
        : { data: { path: "x" }, error: null },
  )
  const remove = vi.fn(async (_paths: string[]) => ({
    data: null,
    error: removeError,
  }))
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl } }))
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl },
    error: null,
  }))
  const bucket = { upload, remove, getPublicUrl, createSignedUrl }
  const storage = { from: vi.fn((_bucket: string) => bucket) }

  const insert = vi.fn((_record: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () =>
        insertError
          ? { data: null, error: insertError }
          : {
              data: {
                id: "file-1",
                organization_id: "org-1",
                bucket: "saas_private",
                storage_path: "orgs/org-1/abc-rapport",
                name: "rapport.pdf",
                mime_type: "application/pdf",
                size_bytes: 17,
                checksum_sha256: "a".repeat(64),
                uploaded_by: "u1",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
              error: null,
            },
      ),
    })),
  }))
  const del = vi.fn(() => ({
    eq: vi.fn(async () => ({ data: null, error: null })),
  }))
  const fromTable = { insert, delete: del }
  const from = vi.fn((_table: string) => fromTable)

  return {
    storage,
    from,
  }
}

beforeEach(() => {
  vi.stubGlobal("crypto", globalThis.crypto)
})

describe("sanitizeFileName", () => {
  it("retire les séparateurs de chemin (traversal)", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe(".._.._etc_passwd")
  })
  it("retire les caractères de contrôle et byte les espaces", () => {
    expect(sanitizeFileName("a\u0000b")).toBe("a_b")
    expect(sanitizeFileName("   ")).toBe("")
    expect(sanitizeFileName("")).toBe("")
  })
  it("borne à 255 caractères", () => {
    expect(sanitizeFileName("a".repeat(400)).length).toBe(255)
  })
})

describe("normalizeMimeType", () => {
  it("normalise en minuscules et refuse les formes invalides", () => {
    expect(normalizeMimeType("Application/PDF")).toBe("application/pdf")
    expect(normalizeMimeType("application/pdf; charset=utf-8")).toBeNull()
    expect(normalizeMimeType("")).toBeNull()
    expect(normalizeMimeType("html")).toBeNull()
  })
})

describe("validateFileUpload", () => {
  it("accepte un fichier valide et normalise le type", () => {
    const result = validateFileUpload(fileData({ type: "Application/PDF" }))
    expect(result).toEqual({
      name: "rapport.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileData().size,
    })
  })

  it("désinfecte un nom de traversée et rejette un nom vide", () => {
    expect(() =>
      validateFileUpload(fileData({ name: "   " })),
    ).toThrow(StorageError)
    const result = validateFileUpload(fileData({ name: "../evil.txt" }))
    expect(result.name).toBe(".._evil.txt")
  })

  it("rejette un fichier vide", () => {
    expect(() => validateFileUpload(fileData({ size: 0 }))).toThrow(
      StorageError,
    )
  })

  it("rejette un fichier trop volumineux", () => {
    const limits = { maxBytes: 10, allowedMimeTypes: ["application/pdf"] }
    expect(() => validateFileUpload(fileData({ size: 100 }), limits)).toThrow(
      /volumineux/,
    )
  })

  it("rejette un type non autorisé (SVG interdit par défaut)", () => {
    expect(() =>
      validateFileUpload(fileData({ type: "image/svg+xml" })),
    ).toThrow("Type de fichier non autorisé.")
  })
})

describe("getUploadLimits", () => {
  it("utilise la valeur d'env bornée par la limite DB", () => {
    expect(getUploadLimits({ STORAGE_MAX_UPLOAD_BYTES: "0" }).maxBytes).toBe(
      DEFAULT_MAX_UPLOAD_BYTES,
    )
    expect(
      getUploadLimits({ STORAGE_MAX_UPLOAD_BYTES: "999999999999" }).maxBytes,
    ).toBe(5 * 1024 * 1024 * 1024)
    expect(
      getUploadLimits({ STORAGE_MAX_UPLOAD_BYTES: "2048" }).maxBytes,
    ).toBe(2048)
  })
})

describe("path", () => {
  it("slugifie les noms (accents retirés)", () => {
    expect(slugifyFileName("Rapport annuel 2026.pdf")).toBe("rapport-annuel-2026")
  })

  it("construit un chemin rigide orgs/<org>/<uuid>-<slug>", () => {
    const path = buildStoragePath(
      "org-1",
      "Rapport annuel.pdf",
      "11111111-2222-3333-4444-555555555555",
    )
    expect(path).toBe(
      "orgs/org-1/11111111-2222-3333-4444-555555555555-rapport-annuel",
    )
  })

  it("extrait l'organisation du chemin", () => {
    const orgId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    expect(storagePathOrganization(`orgs/${orgId}/fichier`)).toBe(orgId)
    expect(storagePathOrganization("autres/org-1/x")).toBeNull()
  })
})

describe("sha256Hex", () => {
  it("calcule l'empreinte SHA-256 attendue", async () => {
    const bytes = new TextEncoder().encode("abc")
    expect(await sha256Hex(bytes.buffer)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })
})

describe("StorageService.upload", () => {
  it("uploade l'objet puis insère les métadonnées", async () => {
    const admin = makeAdmin()
    const service = new StorageService(async () => admin as never)

    const record = await service.upload({
      organizationId: "org-1",
      bucket: "saas_private",
      file: { name: "rapport.pdf", type: "application/pdf", size: BYTES.byteLength, bytes: BYTES },
      uploadedBy: "u1",
    })

    const uploadCall = admin.storage.from("saas_private").upload.mock.calls[0]
    expect(uploadCall[0]).toMatch(/^orgs\/org-1\/[0-9a-f-]+-rapport$/)
    expect(uploadCall[2]).toMatchObject({ contentType: "application/pdf" })

    const insert = admin.from("storage_files").insert
    expect(insert).toHaveBeenCalledTimes(1)
    const payload = insert.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({
      organization_id: "org-1",
      bucket: "saas_private",
      name: "rapport.pdf",
      mime_type: "application/pdf",
      uploaded_by: "u1",
    })
    expect(payload.checksum_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(record.id).toBe("file-1")
  })

  it("revient sur l'échec des métadonnées en supprimant l'objet", async () => {
    const admin = makeAdmin({ insertError: new Error("meta fail") })
    const service = new StorageService(async () => admin as never)

    await expect(
      service.upload({
        organizationId: "org-1",
        bucket: "saas_private",
        file: { name: "ref.pdf", type: "application/pdf", size: BYTES.byteLength, bytes: BYTES },
        uploadedBy: "u1",
      }),
    ).rejects.toThrow(StorageError)

    const uploadedPath = admin.storage.from("saas_private").upload.mock.calls[0][0]
    expect(admin.storage.from("saas_private").remove).toHaveBeenCalledWith([
      uploadedPath,
    ])
  })

  it("refuse un type interdit sans toucher à Storage", async () => {
    const admin = makeAdmin()
    const service = new StorageService(async () => admin as never)

    await expect(
      service.upload({
        organizationId: "org-1",
        bucket: "saas_private",
        file: { name: "evil.svg", type: "image/svg+xml", size: 10, bytes: BYTES },
        uploadedBy: "u1",
      }),
    ).rejects.toThrow("Type de fichier non autorisé.")
    expect(admin.storage.from).not.toHaveBeenCalled()
  })

  it("rejette sans client admin (mode non configuré)", async () => {
    const service = new StorageService(async () => null)
    await expect(
      service.upload({
        organizationId: "org-1",
        bucket: "saas_private",
        file: { name: "a.pdf", type: "application/pdf", size: 1, bytes: BYTES },
        uploadedBy: "u1",
      }),
    ).rejects.toMatchObject({ code: "internal" })
  })
})

describe("StorageService.getAccessUrl", () => {
  it("expose une URL publique pour saas_public (non signée)", async () => {
    const admin = makeAdmin()
    const service = new StorageService(async () => admin as never)

    const access = await service.getAccessUrl({
      bucket: "saas_public",
      storage_path: "orgs/org-1/abc-avatar",
    })

    expect(access).toEqual({
      url: "https://cdn/public",
      signed: false,
      expiresInSeconds: null,
    })
  })

  it("génère une signed URL pour saas_private (durée courte bornée)", async () => {
    const admin = makeAdmin()
    const service = new StorageService(async () => admin as never)

    const access = await service.getAccessUrl(
      { bucket: "saas_private", storage_path: "orgs/org-1/abc-rep" },
      { expiresInSeconds: 99999 },
    )

    expect(access.signed).toBe(true)
    expect(access.url).toBe("https://cdn/signed")
    expect(access.expiresInSeconds).toBe(3600)
  })
})

describe("StorageService.remove", () => {
  it("supprime l'objet puis les métadonnées", async () => {
    const admin = makeAdmin()
    const service = new StorageService(async () => admin as never)

    await service.remove({
      id: "file-1",
      bucket: "saas_private",
      storage_path: "orgs/org-1/abc-rep",
    })

    expect(admin.storage.from("saas_private").remove).toHaveBeenCalledWith([
      "orgs/org-1/abc-rep",
    ])
    expect(admin.from("storage_files").delete).toHaveBeenCalled()
  })
})