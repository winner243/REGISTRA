/** Store minimal compatible avec `next/headers` et `Headers`. */
type HeadersLike = { get(name: string): string | null | undefined }

/**
 * URL de base de l'application — utilise `NEXT_PUBLIC_APP_URL` quand
 * configurée, sinon repli sur l'`Origin` header ou localhost.
 *
 * Utiliser UNIQUEMENT pour construire des redirect URLs (email, OAuth) :
 * ne pas exposer cette valeur au client.
 */
export function getBaseUrlFromHeaders(headerStore: HeadersLike): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured
  return headerStore.get("origin") ?? "http://localhost:3000"
}

/** Caractères interdits dans un chemin de redirection safe. */
const UNSAFE_PATH_CHARS = /[\0\r\n\\]/

/**
 * Garde anti-open-redirect : n'accepte qu'un chemin LOCAL (`/path`),
 * rejette les URL absolues (http://…), les protocoles-relative (`//host`),
 * les null bytes, les retours chariot, les sauts de ligne et les backslashes.
 * Retourne `null` quand la valeur est dangereuse ou absente.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !UNSAFE_PATH_CHARS.test(next)
  ) {
    return next
  }
  return null
}