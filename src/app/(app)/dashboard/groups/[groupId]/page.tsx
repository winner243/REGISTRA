import type { Metadata } from "next"
import Link from "next/link"

import { getGroupDetail } from "@/lib/registra/actions"
import { GroupWorkspace } from "@/components/registra/GroupWorkspace"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { ErrorState } from "@/components/states/error-state"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Groupe",
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const detail = await getGroupDetail(groupId)

  if ("error" in detail) {
    return (
      <div className="flex flex-col gap-6">
        <ErrorState
          title="Groupe indisponible"
          description={detail.error}
        />
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/groups" />}>
            Retour aux groupes
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.group.name}
        description={`${detail.orgName} · ${detail.vocab.groupLabel}`}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/group-history" />}>
            Statistiques &amp; historique
          </Button>
        }
      />

      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/groups" />}>
          ← Retour aux groupes
        </Button>
      </div>

      <GroupWorkspace groupId={detail.group.id} vocab={detail.vocab} />
    </div>
  )
}
