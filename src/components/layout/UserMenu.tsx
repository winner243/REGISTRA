"use client"

import type { User } from "@supabase/supabase-js"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { LogOut, Settings, User as UserIcon } from "lucide-react"
import { signOut } from "@/lib/auth/actions"

interface UserMenuProps {
  user: User
}

export function UserMenu({ user }: UserMenuProps) {
  const email = user.email ?? ""
  const name =
    (user.user_metadata?.name as string | undefined)?.trim() || "Utilisateur"
  const initials = (name.charAt(0) || email.charAt(0) || "?").toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label="Menu du compte"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <form action={signOut} className="flex w-full items-center gap-1.5">
            <button
              type="submit"
              className="flex flex-1 items-center gap-1.5"
            >
              <LogOut />
              Se déconnecter
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
