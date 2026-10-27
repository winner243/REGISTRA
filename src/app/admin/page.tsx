import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { Building2, ClipboardList, CreditCard, Layers, UserRound, Users } from "lucide-react"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getPlatformStats,
  PlatformAdminError,
  type PlatformStats,
} from "@/lib/platform-admin/service"

export const metadata: Metadata = {
  title: "Registra - Administration",
}

/** Libellés des statuts d'abonnement réellement présents en base. */
const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  trialing: "Essai",
  active: "Actif",
  past_due: "Impayé",
  canceled: "Résilié",
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2
  label: string
  value: string | number
  hint?: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * Tableau de bord Super Admin — **uniquement** des compteurs réellement
 * interrogés côté serveur.
 *
 * L'ancienne version affichait `organizations.length * 10` comme nombre
 * d'utilisateurs et des compteurs figés : ces valeurs sont supprimées. En cas
 * d'échec, l'erreur est affichée telle quelle plutôt qu'un chiffre inventé.
 */
export default async function AdminDashboardPage() {
  let stats: PlatformStats | null = null
  let error: string | null = null

  try {
    stats = await getPlatformStats()
  } catch (e) {
    error = e instanceof PlatformAdminError ? e.message : "Erreur inattendue lors du chargement."
  }

  if (error) {
    return (
      <div className="p-6">
        <PageHeader title="Administration" />
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Impossible de charger les statistiques de la plateforme.</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-6">
        <PageHeader title="Administration" />
        <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  const statusEntries = Object.entries(stats.subscriptionsByStatus)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Administration"
        description="Vue globale de la plateforme, indépendante de vos appartenances aux établissements."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Building2}
          label="Établissements"
          value={stats.organizations}
          hint={
            stats.organizations > 0 ? (
              <Link href="/admin/organizations" className="underline underline-offset-2">
                Consulter la liste
              </Link>
            ) : undefined
          }
        />
        <StatCard
          icon={Users}
          label="Comptes utilisateurs"
          value={stats.users}
          hint={
            stats.users > 0 ? (
              <Link href="/admin/users" className="underline underline-offset-2">
                Consulter les comptes
              </Link>
            ) : undefined
          }
        />
        <StatCard icon={UserRound} label="Appartenances" value={stats.memberships} />
        <StatCard icon={Layers} label="Groupes" value={stats.groups} />
        <StatCard icon={UserRound} label="Personnes suivies" value={stats.persons} />
        <StatCard icon={ClipboardList} label="Points de présence enregistrés" value={stats.attendanceRecords} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">Abonnements</CardTitle>
          <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {stats.orgsWithSubscription} établissement(s) sur {stats.organizations} possèdent un
            abonnement.
          </p>

          {statusEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun abonnement enregistré.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {statusEntries.map(([status, count]) => (
                <li key={status}>
                  <Badge variant={status === "active" ? "default" : "secondary"}>
                    {SUBSCRIPTION_STATUS_LABEL[status] ?? status} : {count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Aucun fournisseur de paiement n&apos;est intégré : ces statuts proviennent de la table
            d&apos;abonnement et ne sont pas pilotés par un paiement en ligne. Le module de paiement
            n&apos;est pas implémenté.
          </p>

          <p className="text-sm">
            <Link href="/admin/subscriptions" className="underline underline-offset-2">
              Voir les abonnements détaillés
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
