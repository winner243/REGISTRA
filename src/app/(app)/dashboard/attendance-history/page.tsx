/* Historique d'attendance — route conservée pour compatibilité.
   Réutilise le panneau d'historique unifié (aucune logique dupliquée). */
import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { GroupHistoryPanel } from "@/components/registra/GroupHistoryPanel"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Historique",
}

export default function AttendanceHistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Historique des présences"
        description="Consultez les présences par groupe, par membre et par période"
      />
      <Card>
        <CardContent className="pt-6">
          <GroupHistoryPanel />
        </CardContent>
      </Card>
    </div>
  )
}
