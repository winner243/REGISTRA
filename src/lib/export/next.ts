import { NextResponse } from "next/server"

import { CSV_BOM } from "./csv"
import { ExportError, exportErrorToHttpStatus } from "./errors"
import { contentDispositionAttachment, EXPORT_CONTENT_TYPES } from "./file"
import type { ExportFormat } from "./types"

type TextLike = AsyncIterable<string>

/** Convertit un itérateur asynchrone de strings en `ReadableStream<string>`. */
export function toExportReadableStream(chunks: TextLike): ReadableStream<string> {
  const iterator = chunks[Symbol.asyncIterator]()

  return new ReadableStream<string>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await iterator.return?.()
    },
  })
}

async function* prefixBom(base: TextLike): AsyncGenerator<string> {
  yield CSV_BOM
  for await (const chunk of base) {
    yield chunk
  }
}

/** Adapte un `ReadableStream<string>` en itérable asynchrone (types sûrs). */
export function readableStreamToAsyncIterable(
  stream: ReadableStream<string>,
): TextLike {
  const reader = stream.getReader()

  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => reader.read(),
        return: async () => {
          await reader.cancel()
          return { value: undefined as never, done: true }
        },
      }
    },
  }
}

/**
 * Convertit un itérateur de strings en un `ReadableStream<Uint8Array>`
 * (octets UTF-8) prêt pour le corps d'une `Response`.
 */
export function toByteStream(chunks: TextLike): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(new TextEncoder().encode(value))
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await iterator.return?.()
    },
  })
}

/**
 * Construit la `Response` de téléchargement (attachment) côté serveur.
 * - `Content-Type` CSV/JSON, `Content-Disposition` avec nom de fichier sûr
 *   (RFC 5987), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
 * - CSV : BOM UTF-8 préfixé pour une ouverture correcte dans les tableurs.
 * - La génération se fait **exclusivement côté serveur**.
 */
export function exportResponse(
  stream: ReadableStream<string>,
  options: { fileName: string; format: ExportFormat },
): NextResponse {
  const text = readableStreamToAsyncIterable(stream)
  const body = toByteStream(options.format === "csv" ? prefixBom(text) : text)

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": EXPORT_CONTENT_TYPES[options.format],
      "Content-Disposition": contentDispositionAttachment(options.fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  })
}

/**
 * Mappe une erreur d'export vers une réponse HTTP sans jamais exposer de
 * détails techniques (stack, SQL…). Statut dérivé du code d'erreur.
 */
export function exportErrorResponse(error: unknown): NextResponse {
  if (error instanceof ExportError) {
    return NextResponse.json(
      { error: error.message },
      { status: exportErrorToHttpStatus(error.code) },
    )
  }

  return NextResponse.json(
    { error: "L'export a échoué. Réessaie." },
    { status: 500 },
  )
}