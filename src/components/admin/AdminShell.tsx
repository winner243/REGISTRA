"use client"

/**
 * ⚠️ Composant CLIENT — comme `AppShell` / `MobileNav`.
 *
 * `adminNav` contient des **icônes** (fonctions). Les transmettre depuis un
 * Server Component vers `SidebarNav` déclenche l'erreur React
 * « Functions cannot be passed directly to Client Components ». Importer la
 * navigation depuis un module client — pattern déjà utilisé par
 * `components/layout/MobileNav.tsx` — l'évite sans transmettre de fonction.
 *
 * `signOut` provient d'un module `"use server"` : son import dans un composant
 * client renvoie une référence, pas la fonction elle-même (même mécanisme que
 * `components/layout/UserMenu.tsx`). `children` reste rendu côté serveur par
 * `app/admin/layout.tsx`.
 */

import type { ReactNode } from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { adminNav } from "@/components/admin/admin-nav"
import { SidebarNav } from "@/components/layout/SidebarNav"
import { signOut } from "@/lib/auth/actions"

/**
 * Coquille de l'espace Super Admin.
 *
 * Un seul shell pour **toutes** les routes `/admin/*` : cela supprime la double
 * barre latérale qui résultait du fait que `/admin` vivait dans le groupe de
 * routes `(app)` (donc dans `AppShell`) pendant que `/admin/organizations` et
 * les autres vivaient dans `src/app/admin/`.
 *
 * Déconnexion via la Server Action `signOut` — le lien `/logout` qu'affichait
 * l'ancienne interface ne correspond à aucune route et renvoyait un 404.
 */
export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          <span className="font-semibold">Super Admin</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
            {email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      {/* Navigation compacte sur petit écran (la barre latérale est masquée). */}
      <nav
        className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden"
        aria-label="Navigation (mobile)"
      >
        {adminNav.map((item) =>
          item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : null,
        )}
      </nav>

      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r md:block">
          <div className="sticky top-16 p-4">
            <SidebarNav items={adminNav} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
