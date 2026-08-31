"use client"

import { Logo } from "@/components/brand/Logo"
import { SidebarNav } from "@/components/layout/SidebarNav"
import { sidebarNav } from "@/components/layout/nav"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"

interface MobileNavProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex h-full flex-col gap-4 p-4">
        <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
        <div className="flex items-center px-1">
          <Logo />
        </div>
        <SidebarNav
          items={sidebarNav}
          className="flex-1"
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
