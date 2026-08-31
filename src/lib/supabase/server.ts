import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env"

export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) {
    return null
  }

  const { url, publishableKey } = getSupabaseEnv()
  const cookieStore = await cookies()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll est appelé depuis un Server Component : sans effet.
          // L'écriture des cookies est gérée par le proxy (src/proxy.ts).
        }
      },
    },
  })
}
