import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

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
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    // Supabase non configuré : impossible d'échanger un code d'autorisation.
    return NextResponse.redirect(`${origin}/login?error=supabase_not_configured`)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code ?? "")

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    )
  }

  // Empêche les redirections ouvertes : "next" doit être un chemin local.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"

  return NextResponse.redirect(`${origin}${safeNext}`)
}
