import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { getCurrentUser } from "@/lib/auth/session"

/**
 * Super Admin de plateforme — identification via Supabase Auth `app_metadata`.
 *
 * `app_metadata` est écrit UNIQUEMENT côté serveur (dashboard Supabase ou API
 * admin `service_role`) : un utilisateur ne peut jamais se l'auto-attribuer,
 * contrairement à `user_metadata`. Aucune donnée sensible n'est lue ici.
 *
 * Deny by default : sans claim exact `platform_admin: true`, l'accès est refusé.
 */
export function isPlatformAdmin(user: User | null): boolean {
  if (!user) return false

  const metadata = user.app_metadata as Record<string, unknown> | undefined
  return metadata?.platform_admin === true
}

/**
 * Exige une session ET le claim `platform_admin` (server-side uniquement).
 * - sans session → redirection `/login` ;
 * - session sans claim → redirection `/dashboard` (déni, sans fuite d'information).
 */
export async function requirePlatformAdmin(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  if (!isPlatformAdmin(user)) {
    redirect("/dashboard")
  }

  return user
}
