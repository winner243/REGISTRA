import type { ReactNode } from "react"

import { AdminShell } from "@/components/admin/AdminShell"
import { requirePlatformAdmin } from "@/lib/auth/platform-admin"

/**
 * Garde serveur de tout l'espace Super Admin (`/admin`, `/admin/organizations`,
 * `/admin/users`, `/admin/subscriptions`, `/admin/activity`).
 *
 * Deny by default : refusé sans session valide et sans claim exact
 * `app_metadata.platform_admin === true`. La coquille reçoit l'e-mail du compte
 * vérifié — il n'est jamais lu côté client.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const admin = await requirePlatformAdmin()

  return <AdminShell email={admin.email ?? ""}>{children}</AdminShell>
}
