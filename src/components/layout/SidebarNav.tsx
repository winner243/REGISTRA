"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import type { NavItem } from "@/components/layout/nav"

interface SidebarNavProps {
  items: NavItem[]
  className?: string
  onNavigate?: () => void
}

export function SidebarNav({
  items,
  className,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Navigation">
      {items.map((item) => {
        const active =
          item.active ??
          (item.href !== undefined &&
            (item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)))
        const Icon = item.icon

        if (!item.href) {
          return (
            <span
              key={item.label}
              className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground"
              aria-disabled="true"
            >
              {Icon && <Icon className="size-4 shrink-0" />}
              <span>{item.label}</span>
            </span>
          )
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            {Icon && <Icon className="size-4 shrink-0" />}
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
