import type { Metadata } from "next"

import { subscriptionStatusLabel, subscriptionStatusVariant } from "@/components/admin/admin-labels"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  listPlatformSubscriptions,
  PlatformAdminError,
  type PlatformSubscription,
} from "@/lib/platform-admin/service"

export const metadata: Metadata = {
  title: "Registra - Abonnements",
}

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR")
}

/**
 * Liste globale des abonnements.
 *
 * Corrigé par rapport à l'audit :
 *   - la colonne « Organisation » affichait l'**UUID brut** de
 *     `subscriptions.organization_id` — elle affiche maintenant le nom réel ;
 *   - la colonne « Reste organisations.max » était un tiret codé en dur, sans
 *     source : elle est retirée plutôt que laissée faussement informative ;
 *   - le bouton « Voir » était `disabled` et ne menait nulle part : supprimé ;
 *   - la requête ne demande plus que des colonnes existantes (vérifié en base).
 *
 * Les données proviennent de la table `public.subscriptions` : un abonnement
 * y est enregistré par le backend de facturation. **Aucun fournisseur de
 * paiement n'est intégré** — aucun montant, aucune transaction, aucune
 * facturation automatique n'existe.
 */
export default async function AdminSubscriptionsPage() {
  let subscriptions: PlatformSubscription[] = []
  let error: string | null = null

  try {
    subscriptions = await listPlatformSubscriptions()
  } catch (e) {
    error = e instanceof PlatformAdminError ? e.message : "Erreur inattendue lors du chargement."
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Abonnements"
        description="Abonnements enregistrés pour l'ensemble des établissements."
      />

      <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        Aucun fournisseur de paiement n&apos;est intégré à REGISTRA : cette page reflète
        l&apos;état de la table d&apos;abonnement, sans paiement en ligne, sans transaction et sans
        facturation automatique.
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Impossible de charger les abonnements.</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      {!error && subscriptions.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun abonnement enregistré.</p>
      )}

      {!error && subscriptions.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Établissement</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Période en cours</TableHead>
              <TableHead>Résiliation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell className="font-medium">{sub.organizationName}</TableCell>
                <TableCell>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{sub.planCode}</Badge>
                    {sub.planName && (
                      <span className="text-muted-foreground">{sub.planName}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={subscriptionStatusVariant(sub.status)}>
                    {subscriptionStatusLabel(sub.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(sub.currentPeriodStart)} → {formatDate(sub.currentPeriodEnd)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {sub.cancelAtPeriodEnd ? "À la fin de période" : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
