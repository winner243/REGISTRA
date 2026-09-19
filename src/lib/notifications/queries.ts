import { getCurrentUser } from "@/lib/auth/session"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { NotificationRecord } from "@/lib/notifications/types"

export interface NotificationPreferenceRow {
  channel: string
  enabled: boolean
}

function toNotificationRecord(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    user_id: String(row.user_id),
    type: String(row.type),
    title: String(row.title),
    body: row.body ? String(row.body) : null,
    data: (row.data ?? {}) as Record<string, unknown>,
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at),
  }
}

/** Inbox de l'utilisateur courant, du plus récent au plus ancien. */
export async function listMyNotifications(
  limit = 50,
): Promise<NotificationRecord[]> {
  const user = await getCurrentUser()
  const supabase = await createSupabaseServerClient()
  if (!user || !supabase) {
    return []
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return []
  }

  return (data ?? []).map(toNotificationRecord)
}

/** Préférences effectives de l'utilisateur courant (lignes créées). */
export async function listMyNotificationPreferences(): Promise<
  NotificationPreferenceRow[]
> {
  const user = await getCurrentUser()
  const supabase = await createSupabaseServerClient()
  if (!user || !supabase) {
    return []
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("channel, enabled")

  if (error) {
    return []
  }

  return (data ?? []).map((row) => ({
    channel: String(row.channel),
    enabled: Boolean(row.enabled),
  }))
}