import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/url"

/**
 * Route de callback d'authentification Supabase.
 *
 * C'est ici que Supabase redirige le navigateur après :
 *  - la confirmation d'une adresse email (`signUp` avec email confirmé) ;
 *  - un échange d'authentification OAuth (Google, GitHub, etc.).
 *
 * Le code d'autorisation présent dans l'URL est échangé contre une session
 * (`exchangeCodeForSession`), puis l'utilisateur est redirigé vers le tableau
 * de bord. La session est ensuite disponible côté client comme côté serveur.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  // Utilise NEXT_PUBLIC_APP_URL pour éviter les open redirects.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin

  // Absence de code : erreur générique sans disclosure technique.
  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=auth_callback_missing_code`)
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.redirect(`${appUrl}/login?error=service_unavailable`)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Message générique — ne jamais exposer le message brut Supabase.
    return NextResponse.redirect(`${appUrl}/login?error=auth_callback_failed`)
  }

  // Empêche les redirections ouvertes : "next" doit être un chemin local.
  const safeNext = safeNextPath(next) ?? "/dashboard"

  return NextResponse.redirect(`${appUrl}${safeNext}`)
}
