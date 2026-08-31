import type { ReactNode } from "react"

import { MarketingNav } from "@/components/layout/MarketingNav"
import { brand } from "@/config/brand"

export default function MarketingLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <>
      <MarketingNav />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-center px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} {brand.name}. Tous droits réservés.
          </p>
        </div>
      </footer>
    </>
  )
}
