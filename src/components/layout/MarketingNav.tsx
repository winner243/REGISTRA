"use client"

import { useState } from "react"

import { Navbar } from "@/components/layout/Navbar"
import { mainNav } from "@/components/layout/nav"
import { Logo } from "@/components/brand/Logo"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import Link from "next/link"

export function MarketingNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Navbar
        links={mainNav}
        onMenuClick={() => setOpen(true)}
        rightSlot={
          <Button
            className="hidden md:inline-flex"
            render={<Link href="/login" />}
          >
            Se connecter
          </Button>
        }
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex h-full flex-col gap-6 p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex items-center px-1">
            <Logo />
          </div>
          <nav className="flex flex-col gap-1" aria-label="Menu mobile">
            {mainNav.map((item) => {
              if (!item.href) {
                return (
                  <span
                    key={item.label}
                    className="flex h-8 items-center rounded-md px-2.5 text-sm text-muted-foreground"
                    aria-disabled="true"
                  >
                    {item.label}
                  </span>
                )
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-8 items-center rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring outline-none"
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="mt-auto">
            <Button className="w-full" render={<Link href="/login" />}>
              Se connecter
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
