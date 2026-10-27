import { NextResponse, type NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { timingSafeEqual } from "crypto"

import { protectRequest } from "@/lib/rate-limit"
import { rateLimitPresets } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

// Reference integration : la couche de rate limiting protège les endpoints
// exposés. Ce route réalise de l'egress réseau (Sentry) : il ne doit pas
// pouvoir être spammé. La règle (`rateLimitPresets.api`) est ajustable.
const RATE_LIMIT_RULE = rateLimitPresets.api
const RATE_LIMIT_PREFIX = "sentry-test"

// Secret d'accès côté serveur UNIQUEMENT (jamais de NEXT_PUBLIC_*, jamais dans
// le bundle). Non défini → l'endpoint n'est pas exposé (deny by default).
const SENTRY_TEST_SECRET = process.env.SENTRY_TEST_SECRET

/**
 * Vérification constant-time du token Bearer (protection timing attack).
 * Même implémentation que `/api/cron/run` : convention commune du dépôt.
 */
function verifyBearerToken(auth: string | null, secret: string): boolean {
  if (!auth || !auth.startsWith("Bearer ")) return false
  const token = Buffer.from(auth.slice(7))
  const expected = Buffer.from(secret)
  if (token.length !== expected.length) return false
  return timingSafeEqual(token, expected)
}

/**
 * Endpoint de diagnostic Sentry.
 *
 * Sécurité :
 *   - rate limit d'abord (l'egress réseau n'est pas spammable) ;
 *   - `SENTRY_TEST_SECRET` absent → 503, l'endpoint n'existe pas pour le monde ;
 *   - Bearer invalide → 401 (comparaison constant-time) ;
 *   - le DSN n'est JAMAIS renvoyé dans la réponse (aucune divulgation).
 *
 * Il ne capture qu'une erreur **factice** : c'est un test de câblage, pas un
 * outil de production. Il reste référencé par `docs/monitoring.md`,
 * `docs/rate-limiting.md` et la collection Bruno comme implémentation de
 * référence du rate limiting.
 */
export async function GET(request: NextRequest) {
  const limited = protectRequest(request, {
    prefix: RATE_LIMIT_PREFIX,
    rule: RATE_LIMIT_RULE,
  })
  if (limited) {
    return limited
  }

  if (!SENTRY_TEST_SECRET) {
    return NextResponse.json(
      { ok: false, error: "sentry-test not configured" },
      { status: 503 },
    )
  }

  const auth = request.headers.get("authorization")
  if (!verifyBearerToken(auth, SENTRY_TEST_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const capture = request.nextUrl.searchParams.get("capture") ?? "exception"

  const client = Sentry.getClient()

  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Sentry non initialisé (pas de client)" },
      { status: 500 },
    )
  }

  const testError = new Error(
    `[TEST SENTRY ${new Date().toISOString()}] erreur ${capture}`,
  )

  if (capture === "requestError") {
    Sentry.captureRequestError(testError, {
      path: request.nextUrl.pathname,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
    }, {
      routerKind: "Route Handler",
      routePath: "/api/__sentry-test",
      routeType: "route-handler",
    })
  } else {
    Sentry.captureException(testError)
  }

  await client.flush(3000)

  // Aucune divulgation de configuration : plus de `dsn` dans la réponse.
  return NextResponse.json({
    ok: true,
    capture,
  })
}
