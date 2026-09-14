import type { Metadata } from "next"
import Link from "next/link"

import { getCurrentUser } from "@/lib/auth/session"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Compte",
}

export default async function AccountPage() {
  const user = await getCurrentUser()
  const email = user?.email ?? ""

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compte"
        description="Gérez votre compte et votre sécurité."
      />

      <Card>
        <CardHeader>
          <CardTitle>Informations du compte</CardTitle>
          <CardDescription>
            Les informations associées à votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Email</span>
              <span className="break-all font-medium text-foreground">
                {email || "—"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Mot de passe</span>
              <span className="font-medium text-foreground">••••••••</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sécurité</CardTitle>
          <CardDescription>
            Actions liées à la sécurité de votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled title="Fonctionnalité à venir">
            Changer le mot de passe
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Zone de danger</CardTitle>
          <CardDescription>
            Actions irréversibles sur votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            La suppression de compte nécessite une confirmation sécurisée et
            n&apos;est pas encore disponible.
          </p>
        </CardContent>
        <CardFooter>
          <Button
            variant="destructive"
            disabled
            title="Suppression bientôt disponible"
          >
            Supprimer le compte
          </Button>
        </CardFooter>
      </Card>

      <div>
        <Button variant="ghost" render={<Link href="/forgot-password" />}>
          Réinitialiser le mot de passe
        </Button>
      </div>
    </div>
  )
}
