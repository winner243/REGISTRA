"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { User } from "@supabase/supabase-js"

import { Navbar } from "@/components/layout/Navbar"
import { Sidebar } from "@/components/layout/Sidebar"
import { MobileNav } from "@/components/layout/MobileNav"
import { UserMenu } from "@/components/layout/UserMenu"
import { identify } from "@/lib/analytics"

interface AppShellProps {
  user: User
  children: ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Rattache les événements à l'utilisateur authentifié (identifiant
  // stable non personnel, cf. lib/analytics). Ne dépend pas de PostHog :
  // identify() est un no-op si aucun fournisseur n'est configuré.
  useEffect(() => {
    identify(user.id)
  }, [user.id])

  return (
    <div className="flex min-h-full flex-col">
      <Navbar rightSlot={<UserMenu user={user} />} onMenuClick={() => setMobileOpen(true)} />
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
    </div>
  )
}
