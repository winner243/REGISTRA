/* Établissements & groupes — gestion par établissement (choix explicite) */
import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { GroupsManager } from "@/components/registra/GroupsManager"
import { listUserOrganizations } from "@/lib/orgs"

export const metadata: Metadata = {
  title: "Groupes",
}

export default async function GroupsPage() {
  const organizations = await listUserOrganizations()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Établissements & groupes"
        description="Chaque établissement et ses groupes — aucun choix implicite"
      />
      <GroupsManager organizations={organizations.map(({ id, name }) => ({ id, name }))} />
    </div>
  )
}
