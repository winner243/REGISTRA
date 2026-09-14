import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth/session"
import { listUserOrganizations } from "@/lib/orgs"
import { getOrganizationPlan } from "@/lib/billing"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Facturation",
}

export default async function BillingPage() {
  const user = await getCurrentUser()

  let orgName: string | null = null
  let plan: string | null = null

  if (user) {
    try {
      const orgs = await listUserOrganizations()
      const org = orgs[0] ?? null
      if (org) {
        orgName = org.name
        // Lecture seule : la base est la source de vérité (voir docs/billing.md).
        plan = await getOrganizationPlan(org.id)
      }
    } catch {
      // Aucun plan affichable (Supabase non configuré, erreur réseau…) :
      // l'état « Aucun plan actif » reste un placeholder honnête.
      plan = null
    }
  }

  const hasPlan = Boolean(plan)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Facturation"
        description="Votre plan et vos informations de paiement."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan actuel</CardTitle>
            <CardDescription>
              {orgName ? `Organisation : ${orgName}` : "Aucune organisation."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold text-foreground">
                {plan ?? "Aucun plan actif"}
              </span>
              <span className="text-sm text-muted-foreground">
                {hasPlan
                  ? "Abonnement actif"
                  : "Aucun plan n'est encore configuré pour cette organisation."}
              </span>
            </div>
            <Badge variant={hasPlan ? "default" : "outline"}>
              {hasPlan ? "Actif" : "À configurer"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paiement</CardTitle>
            <CardDescription>Informations de facturation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Prochaine échéance</dt>
                <dd className="font-medium text-foreground">--</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Moyen de paiement</dt>
                <dd className="font-medium text-foreground">--</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Les informations de paiement apparaîtront lors du branchement d&apos;un
              fournisseur de paiement.
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <Button
          variant="outline"
          disabled
          title="La gestion de l'abonnement arrive bientôt"
        >
          Gérer l&apos;abonnement
        </Button>
      </div>
    </div>
  )
}