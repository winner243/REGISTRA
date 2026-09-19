import type { Metadata } from "next"

import { NotificationsList } from "@/components/dashboard/notifications-list"
import { PageHeader } from "@/components/dashboard/PageHeader"
import {
  listMyNotificationPreferences,
  listMyNotifications,
} from "@/lib/notifications"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Notifications",
}

export default async function NotificationsPage() {
  const [notifications, preferences] = await Promise.all([
    listMyNotifications(50),
    listMyNotificationPreferences(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Vos alertes in-app et emails, du plus récent au plus ancien."
      />
      <Card>
        <CardContent className="flex flex-col gap-2 py-0">
          <NotificationsList
            notifications={notifications}
            preferences={preferences}
          />
        </CardContent>
      </Card>
    </div>
  )
}
