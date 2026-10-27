/* Historique & statistiques (unifié) : membre + période + plage de dates */
import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { GroupHistoryPanel } from "@/components/registra/GroupHistoryPanel"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Historique",
}

export default function GroupHistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Historique & statistiques"
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
