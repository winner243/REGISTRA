import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { getCurrentUser } from "@/lib/auth/session"

export default async function AuthLayout({
  children,
}: {
  children: ReactNode
}) {
  const user = await getCurrentUser()

  if (user) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center">
      {children}
    </main>
  )
}
