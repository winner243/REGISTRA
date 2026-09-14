import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { SettingsTabs } from "@/components/settings/settings-tabs"

export const metadata: Metadata = {
  title: "Paramètres",
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Paramètres"
        description="Gérez les préférences de votre espace."
      />
      <SettingsTabs />
    </div>
  )
}
