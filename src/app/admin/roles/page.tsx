import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  listPlatformRoles,
  PlatformAdminError,
  type PlatformRole,
} from "@/lib/platform-admin/service"

export const metadata: Metadata = {
  title: "Registra - Rôles et permissions",
}

/**
 * Rôles de la plateforme, leurs permissions et leur effectif réel.
 *
 * Données issues des tables réelles `roles`, `permissions`, `role_permissions`
 * et `memberships` — aucune valeur fabriquée.
 *
 * Lecture seule délibérée : les rôles et permissions sont **globaux** (ils
 * s'appliquent à toutes les organisations). Les modifier toucherait immédiatement
 * à chaque tenant ; aucune interface d'écriture n'est prévue dans ce périmètre,
 * donc aucune n'est affichée — plutôt qu'un bouton non fonctionnel.
 */
export default async function AdminRolesPage() {
  let roles: PlatformRole[] = []
  let error: string | null = null

  try {
    roles = await listPlatformRoles()
  } catch (e) {
    error = e instanceof PlatformAdminError ? e.message : "Erreur inattendue lors du chargement."
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Rôles et permissions"
        description="Rôles disponibles sur la plateforme, permissions associées et nombre de membres."
      />

      <p className="text-sm text-muted-foreground">
        Vue informative : les rôles sont gérés par chaque organisation depuis sa
        page Équipe (permission <code>members.update</code>, réservée à ses owners
        et admins). Aucune modification n&apos;est proposée ici : le catalogue de
        permissions ne contient pas de permission « plateforme », et le trigger{" "}
        <code>prevent_last_owner_removal</code> protège déjà le dernier owner de
        chaque organisation.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Impossible de charger les rôles.</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      {!error && roles.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun rôle enregistré.</p>
      )}

      {!error && roles.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rôle</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="text-right">Membres</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.name}>
                <TableCell className="font-medium">
                  <Badge variant="outline">{role.name}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {role.description ?? "—"}
                </TableCell>
                <TableCell>
                  {role.permissions.length === 0 ? (
                    <span className="text-muted-foreground">Aucune</span>
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {role.permissions.map((permission) => (
                        <Badge key={permission.name} variant="secondary">
                          {permission.name}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{role.memberCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
