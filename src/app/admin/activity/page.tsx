import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ATTENDANCE_CYCLE, statusFullText, type AttendanceStatus } from "@/lib/registra/utils"
import {
  listPlatformAttendance,
  PlatformAdminError,
  type PlatformAttendanceRow,
} from "@/lib/platform-admin/service"

export const metadata: Metadata = {
  title: "Registra - Présences récentes",
}

const KNOWN_STATUS = new Set<string>(ATTENDANCE_CYCLE)

function statusText(status: string): string {
  return KNOWN_STATUS.has(status) ? statusFullText(status as AttendanceStatus) : status
}

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR")
}

/**
 * Derniers points de présence de la plateforme, avec noms résolus.
 *
 * **Intitulé corrigé** : cette page s'appelait « Activité » / « Journal
 * d'audit » et s'affichait comme « Activité système récente ». Elle ne consulte
 * que la table `attendance_records` — des pointages de présence. Aucune
 * table d'audit n'existe dans le schéma et aucun événement d'administration
 * n'est journalisé. L'intitulé est désormais « Présences récentes », fidèle à
 * la donnée réellement affichée.
 *
 * Le libellé de la colonne Groupe/Personne était un UUID brut : il est
 * remplacé par le nom réel, et l'absence de nom (groupe/personne supprimée)
 * est explicite plutôt que masquée.
 */
export default async function AdminActivityPage() {
  let rows: PlatformAttendanceRow[] = []
  let error: string | null = null

  try {
    rows = await listPlatformAttendance(100)
  } catch (e) {
    error = e instanceof PlatformAdminError ? e.message : "Erreur inattendue lors du chargement."
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Présences récentes"
        description="100 derniers points de présence enregistrés sur la plateforme."
      />

      <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        Cette page ne constitue pas un journal d&apos;audit : elle ne recense que des présences.
        REGISTRA ne dispose d&apos;aucune table d&apos;audit des actions d&apos;administration.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Impossible de charger les présences.</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      {!error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun point de présence enregistré.</p>
      )}

      {!error && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Établissement</TableHead>
              <TableHead>Groupe</TableHead>
              <TableHead>Personne</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground">{formatDate(row.recordDate)}</TableCell>
                <TableCell className="font-medium">{row.organizationName}</TableCell>
                <TableCell>
                  {row.groupName ?? <span className="text-muted-foreground">Groupe introuvable</span>}
                </TableCell>
                <TableCell>
                  {row.personName ?? (
                    <span className="text-muted-foreground">Personne introuvable</span>
                  )}
                </TableCell>
                <TableCell>{statusText(row.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
