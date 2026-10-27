import type { Metadata } from "next"

import { subscriptionStatusLabel, subscriptionStatusVariant } from "@/components/admin/admin-labels"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CreateOrganizationForm } from "@/components/orgs/create-organization-form"
import { ORG_TYPES } from "@/lib/registra/vocab"
import {
  listPlatformOrganizations,
  PlatformAdminError,
  type PlatformOrganization,
} from "@/lib/platform-admin/service"

import { OrganizationEditForm } from "./OrganizationEditForm"

export const metadata: Metadata = {
  title: "Registra - Établissements",
}

const TYPE_LABEL = new Map<string, string>(ORG_TYPES.map((t) => [t.value, t.label]))

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR")
}

/**
 * Liste globale des établissements de la plateforme.
 *
 * Colonnes issues du schéma réel :
 *   - `organizations` : id, name, created_by, created_at, updated_at ;
 *   - `organization_registra_settings` : organization_type (1:1, **peut être
 *     absent** — affiché « — » plutôt que supposé) ;
 *   - `memberships` : effectif réellement compté ;
 *   - `subscriptions` : plan et statut, ou absence explicite d'abonnement.
 *
 * Les colonnes `organization_type` / `plan_code` / `member_count`, auparavant
 * demandées à la table `organizations`, n'existent pas (vérifié en base :
 * erreur PostgreSQL 42703) : elles ne sont plus interrogées.
 *
 * Actions proposées — et uniquement celles réellement opérationnelles :
 *   - **Créer** : réutilise `CreateOrganizationForm` →
 *     `createRegistraOrganization`, l'action métier existante. Insert sous RLS
 *     (`organizations_insert_own`), le trigger `handle_organization_created`
 *     attribue le rôle `owner` au créateur — aucun `service_role` nécessaire,
 *     aucun second chemin de création inventé.
 *   - **Modifier** : nom et type REGISTRA, via un Server Action qui revérifie
 *     `app_metadata.platform_admin === true` avant d'écrire. La voie privilégiée
 *     est nécessaire ici car RLS n'accorde aucun accès à un Super Admin sans
 *     appartenance.
 *
 * Aucune suppression n'est proposée : elle détruirait en cascade les membres,
 * présences et abonnements de l'établissement (opération irréversible, à
 * autoriser explicitement). Masquer l'action plutôt que de la simuler.
 *
 * Aucun changement de rôle non plus : les rôles sont la propriété de chaque
 * organisation (RLS `members.update`), le catalogue des permissions ne contient
 * aucune permission « plateforme », et le trigger `prevent_last_owner_removal`
 * protège déjà le dernier owner.
 */
export default async function AdminOrganizationsPage() {
  let organizations: PlatformOrganization[] = []
  let error: string | null = null

  try {
    organizations = await listPlatformOrganizations()
  } catch (e) {
    error = e instanceof PlatformAdminError ? e.message : "Erreur inattendue lors du chargement."
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Établissements"
        description="Ensemble des organisations de la plateforme, indépendamment de vos appartenances."
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Impossible de charger les établissements.</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      {!error && (
        <div className="rounded-lg border p-4">
          <CreateOrganizationForm hasOrganizations={organizations.length > 0} />
        </div>
      )}

      {!error && organizations.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun établissement enregistré.</p>
      )}

      {!error && organizations.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Membres</TableHead>
              <TableHead>Abonnement</TableHead>
              <TableHead>Créé le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>
                  {org.orgType ? (
                    TYPE_LABEL.get(org.orgType) ?? org.orgType
                  ) : (
                    <span className="text-muted-foreground" title="Aucun réglage REGISTRA pour cet établissement">
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{org.memberCount}</TableCell>
                <TableCell>
                  {org.hasSubscription && org.planCode && org.subscriptionStatus ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{org.planCode}</Badge>
                      <Badge variant={subscriptionStatusVariant(org.subscriptionStatus)}>
                        {subscriptionStatusLabel(org.subscriptionStatus)}
                      </Badge>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Aucun abonnement</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(org.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <OrganizationEditForm
                    organization={{ id: org.id, name: org.name }}
                    currentType={org.orgType}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
