import { NextResponse, type NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"

import { protectRequest } from "@/lib/rate-limit"
import { rateLimitPresets } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

// Reference integration : la couche de rate limiting protège les endpoints
// exposés. Ce route réalise de l'egress réseau (Sentry) : il ne doit pas
// pouvoir être spammé. La règle (`rateLimitPresets.api`) est ajustable.
const RATE_LIMIT_RULE = rateLimitPresets.api
const RATE_LIMIT_PREFIX = "sentry-test"

export async function GET(request: NextRequest) {
  const limited = protectRequest(request, {
    prefix: RATE_LIMIT_PREFIX,
    rule: RATE_LIMIT_RULE,
  })
  if (limited) {
    return limited
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

  return NextResponse.json({
    ok: true,
    dsn: client.getDsn()?.toString(),
    capture,
  })
}
