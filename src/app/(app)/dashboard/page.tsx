/* Dashboard — vue d'ensemble : établissements, leurs groupes, création et recherche */
import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/dashboard/PageHeader'
import { CreateOrganizationForm } from '@/components/orgs/create-organization-form'
import { GlobalSearch } from '@/components/registra/GlobalSearch'
import { EmptyState } from '@/components/states/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listUserOrganizations } from '@/lib/orgs'
import { listGroups } from '@/lib/registra/repositories/groups'
import { Building2, Layers } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Registra - Tableau de bord',
}

export default async function DashboardPage() {
  const organizations = await listUserOrganizations()

  const withGroups = await Promise.all(
    organizations.map(async (org) => ({
      org,
      groups: await listGroups(org.id),
    })),
  )

  const totalGroups = withGroups.reduce((sum, entry) => sum + entry.groups.length, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="Vos établissements, leurs groupes et la feuille de présence"
      />

      {organizations.length > 0 && <GlobalSearch />}

      {organizations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Commencer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EmptyState
              icon={Building2}
              title="Aucun établissement"
              description="Créez votre premier établissement pour organiser vos groupes et prendre les présences."
            />
            <CreateOrganizationForm hasOrganizations={false} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4">
            {withGroups.map(({ org, groups }) => (
              <Card key={org.id} id={`org-${org.id}`} className="scroll-mt-20">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 aria-hidden="true" className="size-4 text-muted-foreground" />
                    {org.name}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {groups.length} groupe{groups.length > 1 ? 's' : ''}
                  </span>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun groupe. Ouvrez les groupes pour en créer un.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {groups.map((group) => (
                        <Link
                          key={group.id}
                          href={`/dashboard/groups/${group.id}`}
                          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-muted"
                        >
                          <Layers aria-hidden="true" className="size-4 text-muted-foreground" />
                          <span className="truncate font-medium">{group.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                  <div>
                    <Link
                      href="/dashboard/groups"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Gérer les groupes de cet établissement
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ajouter un établissement</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateOrganizationForm hasOrganizations />
            </CardContent>
          </Card>

          {totalGroups === 0 && (
            <p className="text-sm text-muted-foreground">
              Créez un groupe pour commencer à prendre les présences.
            </p>
          )}
        </>
      )}
    </div>
  )
}
