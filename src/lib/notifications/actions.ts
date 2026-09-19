"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/auth/session"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type NotificationActionState = {
  error?: string
  success?: string
} | null

function unauthorized(): NotificationActionState {
  return { error: "Connectez-vous pour gérer vos notifications." }
}

function unavailable(): NotificationActionState {
  return { error: "Supabase n'est pas configuré sur ce projet." }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

/**
 * Marque comme lues les notifications fournies (ownership vérifiée en base
 * par `mark_notifications_read`). Maille par identifiants UUID.
 */
export async function markNotificationsRead(
  ids: string[],
): Promise<NotificationActionState> {
  const user = await getCurrentUser()
  if (!user) {
    return unauthorized()
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return unavailable()
  }

  const cleaned = Array.isArray(ids)
    ? ids.filter((id) => typeof id === "string" && isUuid(id))
    : []
  if (cleaned.length === 0) {
    return { error: "Aucune notification sélectionnée." }
  }

  const { data, error } = await supabase.rpc("mark_notifications_read", {
    p_ids: cleaned,
  })

  if (error) {
    return { error: "Impossible de mettre à jour les notifications." }
  }

  revalidatePath("/dashboard/notifications")

  const count = typeof data === "number" ? data : 0
  return count > 0
    ? { success: `${count} notification${count > 1 ? "s" : ""} marquée${count > 1 ? "s" : ""} comme lue${count > 1 ? "s" : ""}.` }
    : { success: "Les notifications sélectionnées étaient déjà lues." }
}

/** Supprime une notification de l'historique de l'utilisateur (RLS own). */
export async function dismissNotification(
  id: string,
): Promise<NotificationActionState> {
  const user = await getCurrentUser()
  if (!user) {
    return unauthorized()
  }

  if (!isUuid(id)) {
    return { error: "Notification inconnue." }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return unavailable()
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)

  if (error) {
    return { error: "Impossible de supprimer la notification." }
  }

  revalidatePath("/dashboard/notifications")
  return { success: "Notification supprimée." }
}

const NOTIFICATION_CHANNELS = ["in_app", "email", "push"] as const

/**
 * Modifie la préférence d'un canal (in_app / email / push). L'absence de ligne
 * signifie « activé » ; le comportement d'activation au premier accès n'a donc
 * aucune existence en base.
 */
export async function setNotificationPreference(
  channel: string,
  enabled: boolean,
): Promise<NotificationActionState> {
  const user = await getCurrentUser()
  if (!user) {
    return unauthorized()
  }

  if (!NOTIFICATION_CHANNELS.includes(channel as (typeof NOTIFICATION_CHANNELS)[number])) {
    return { error: "Canal de notification inconnu." }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return unavailable()
  }

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: user.id, channel, enabled: Boolean(enabled) },
      { onConflict: "user_id,channel" },
    )

  if (error) {
    return { error: "Impossible d'enregistrer la préférence." }
  }

  revalidatePath("/dashboard/settings")
  return { success: "Préférences enregistrées." }
}