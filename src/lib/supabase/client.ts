"use client"

import { createBrowserClient } from "@supabase/ssr"

import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env"

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    return null
  }

  const { url, publishableKey } = getSupabaseEnv()

  return createBrowserClient(url, publishableKey)
}
