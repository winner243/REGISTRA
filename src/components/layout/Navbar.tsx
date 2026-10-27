"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { Logo } from "@/components/brand/Logo"
import { brand } from "@/config/brand"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NavItem } from "@/components/layout/nav"

interface NavbarProps {
  links?: NavItem[]
  rightSlot?: ReactNode
  onMenuClick?: () => void
  className?: string
}

export function Navbar({
  links = [],
  rightSlot,
  onMenuClick,
  className,
}: NavbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80",
        className
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={brand.logo.alt}
        >
          <Logo />
        </Link>

        {links.length > 0 && (
          <nav
            className="ml-6 hidden items-center gap-1 md:flex"
            aria-label="Navigation principale"
          >
            {links.map((item) => {
              if (!item.href) {
                return (
                  <span
                    key={item.label}
                    className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground"
                    aria-disabled="true"
                  >
                    {item.label}
                  </span>
                )
              }
              return (
                <Button key={item.label} variant="ghost" size="sm" nativeButton={false} render={<Link href={item.href} />}>
                  {item.label}
                </Button>
              )
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          {rightSlot}
          {onMenuClick && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Ouvrir le menu"
              onClick={onMenuClick}
            >
              <Menu />
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
