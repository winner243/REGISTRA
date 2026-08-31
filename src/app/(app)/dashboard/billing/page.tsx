import type { Metadata } from "next"

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

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing"
        description="Gérez votre plan et vos informations de paiement."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current plan</CardTitle>
            <CardDescription>Votre abonnement actuel.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold text-foreground">Pro</span>
              <span className="text-sm text-muted-foreground">$19 / month</span>
            </div>
            <Badge variant="outline">Actif</Badge>
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
                <dt className="text-muted-foreground">Next billing date</dt>
                <dd className="font-medium text-foreground">--</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Payment method</dt>
                <dd className="font-medium text-foreground">--</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div>
        <Button
          variant="outline"
          disabled
          title="La gestion de l'abonnement arrive bientôt"
        >
          Manage subscription
        </Button>
      </div>
    </div>
  )
}
