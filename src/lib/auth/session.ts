import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { User } from "@supabase/supabase-js"

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return null
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  return user
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null
}
