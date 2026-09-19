import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseEnv } from "@/lib/supabase/env"

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Vrai quand une clé `service_role` est disponible pour l'outbox / le worker.
 * `service_role` contourne RLS : ce client ne doit JAMAIS être importé ni
 * invoqué par du code exposé au client (Server Action, composant…).
 */
export function isSupabaseAdminConfigured() {
  return Boolean(serviceRoleKey)
}

/**
 * Client Supabase `service_role` (contourne RLS) — usage serveur strictement
 * technique : queues (email outbox), jobs, migrations d'exploitation.
 * Retourne `null` quand non configuré pour permettre un mode dégradé propre.
 */
export async function createSupabaseAdminClient(): Promise<SupabaseClient | null> {
  if (!serviceRoleKey) {
    return null
  }

  const { url } = getSupabaseEnv()

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}