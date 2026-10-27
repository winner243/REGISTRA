/* Historique individuel — sélection d'un membre via une liste (plus d'UUID).
   Réutilise le panneau d'historique unifié. */
import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { GroupHistoryPanel } from "@/components/registra/GroupHistoryPanel"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Historique individuel",
}

export default function PersonHistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Historique individuel"
        description="Sélectionnez un groupe puis un membre pour voir son historique"
      />
      <Card>
        <CardContent className="pt-6">
          <GroupHistoryPanel />
        </CardContent>
      </Card>
    </div>
  )
}
