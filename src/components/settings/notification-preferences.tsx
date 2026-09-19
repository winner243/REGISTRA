"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  setNotificationPreference,
} from "@/lib/notifications/actions"
import type { NotificationActionState } from "@/lib/notifications/actions"
import type { NotificationChannel } from "@/lib/notifications/types"

import { Switch } from "@/components/ui/switch"

const CHANNEL_LABELS: Partial<Record<NotificationChannel, string>> = {
  email: "Emails",
  push: "Push",
}

const CHANNEL_DESCRIPTIONS: Partial<Record<NotificationChannel, string>> = {
  email: "Alertes envoyées à votre adresse email (confirmations, mises à jour).",
  push: "Réservé pour l'avenir : aucune ligne ne peut être créée en base, mais la préférence reste disponible.",
}

/** Canaux exposés dans les préférences minimales in-app (`in_app` réservé, toujours
 * activé par absence de ligne). `push` est exposé pour l'UI future uniquement. */
const PREFERENCE_CHANNELS: NotificationChannel[] = ["email", "push"]

export function NotificationPreferences({
  initialPreferences = [],
}: {
  initialPreferences: { channel: string; enabled: boolean }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [prefs, setPrefs] = useState(
    new Map(initialPreferences.map((p) => [p.channel, p.enabled])),
  )

  function toggle(channel: NotificationChannel, enabled: boolean) {
    startTransition(async () => {
      const result: NotificationActionState = await setNotificationPreference(
        channel,
        enabled,
      )
      if (!result?.error) {
        setPrefs((prev) => new Map(prev).set(channel, enabled))
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {PREFERENCE_CHANNELS.map((channel) => (
        <div
          key={channel}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {CHANNEL_LABELS[channel]}
            </span>
            <span className="text-sm text-muted-foreground">
              {CHANNEL_DESCRIPTIONS[channel]}
            </span>
          </div>
          <Switch
            checked={prefs.get(channel) ?? true}
            disabled={pending}
            onCheckedChange={(enabled) => toggle(channel, enabled)}
          />
        </div>
      ))}
    </div>
  )
}
