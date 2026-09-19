import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { listMyNotificationPreferences } from "@/lib/notifications"

export const metadata: Metadata = {
  title: "Paramètres",
}

export default async function SettingsPage() {
  const notificationPreferences = await listMyNotificationPreferences()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Paramètres"
        description="Gérez les préférences de votre espace."
      />
      <SettingsTabs notificationPreferences={notificationPreferences} />
    </div>
  )
}
