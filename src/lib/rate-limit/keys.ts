/** En-têtes supportés : `Headers`, `ReadonlyHeaders` (next/headers), etc. */
type HeadersLike = {
  get(name: string): string | null | undefined
}

/**
 * Extraction d'un identifiant réseau fiable à partir des headers.
 * L'IP est utilisée pour le quota des endpoints sans authentification
 * (connexion, endpoints publics) : elle ne remplace jamais une identité
 * vérifiée côté serveur.
 */
export function clientIpFromHeaders(headers: HeadersLike): string | null {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null
  }

  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    null
  )
}

/** Extraction d'un identifiant réseau fiable depuis une requête. */
export function clientIp(request: Request): string | null {
  return clientIpFromHeaders(request.headers)
}

/**
 * Clé de quota pour une requête. Priorité :
 * 1. `userId` fourni (identité vérifiée côté serveur) ;
 * 2. IP du client ;
 * 3. fallback `unknown`.
 */
export function buildRateLimitKey(
  prefix: string,
  userId: string | null | undefined,
  request?: Request,
): string {
  if (userId) {
    return `${prefix}:user:${userId}`
  }
  const ip = request ? clientIp(request) : null
  return `${prefix}:ip:${ip ?? "unknown"}`
}