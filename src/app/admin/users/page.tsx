import type { Metadata } from "next"

import { roleLabel } from "@/components/admin/admin-labels"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  listPlatformUsers,
  PlatformAdminError,
  type PlatformUser,
} from "@/lib/platform-admin/service"

export const metadata: Metadata = {
  title: "Registra - Utilisateurs",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR")
}

/**
 * Liste des comptes utilisateurs de la plateforme.
 *
 * Deux sources distinctes, **volontairement non fusionnées** :
 *
 *   - `auth.users` — comptes Auth (via `auth.admin.listUsers`) : existence du
 *     compte, e-mail, dates de création et de dernière connexion. C'est la
 *     seule source de l'adresse e-mail, `public.profiles` n'en porte pas ;
 *   - `public.profiles` — profil applicatif (nom complet) : peut être absent
 *     pour un compte Auth tout à fait valide (`hasProfile` → « Aucun profil »).
 *
 * Une absence de profil n'est pas masquée : elle est affichée comme telle,
 * pour ne pas faire passer un profil pour un compte ou l'inverse.
 *
 * Seules les données nécessaires à la supervision sont affichées : e-mail,
 * nom du profil, dates, appartenances. Aucun métadonnée de session ni
 * information d'authentification n'est exposée.
 */
export default async function AdminUsersPage() {
  let users: PlatformUser[] = []
  let error: string | null = null

  try {
    users = await listPlatformUsers()
  } catch (e) {
    error = e instanceof PlatformAdminError ? e.message : "Erreur inattendue lors du chargement."
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Utilisateurs"
        description="Comptes d'authentification et appartenances aux établissements."
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Impossible de charger les utilisateurs.</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      {!error && users.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun compte utilisateur.</p>
      )}

      {!error && users.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Compte</TableHead>
              <TableHead>Nom du profil</TableHead>
              <TableHead>Établissements</TableHead>
              <TableHead>Créé le</TableHead>
              <TableHead>Dernière connexion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{user.email || "—"}</span>
                    {user.platformAdmin && <Badge>Super Admin</Badge>}
                  </span>
                </TableCell>
                <TableCell>
                  {user.hasProfile ? (
                    user.fullName || <span className="text-muted-foreground">Nom non renseigné</span>
                  ) : (
                    <span className="text-muted-foreground" title="Ce compte n'a pas encore de profil applicatif">
                      Aucun profil
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {user.memberships.length === 0 ? (
                    <span className="text-muted-foreground">Aucun établissement</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {user.memberships.map((m) => (
                        <li key={m.organizationId} className="text-sm">
                          {m.organizationName}
                          <span className="text-muted-foreground"> — {roleLabel(m.role)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(user.lastSignInAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
