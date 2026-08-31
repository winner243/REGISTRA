import type { ReactNode } from "react"

import { requireUser } from "@/lib/auth/session"
import { AppShell } from "@/components/layout/AppShell"

export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const user = await requireUser()

  return <AppShell user={user}>{children}</AppShell>
}
