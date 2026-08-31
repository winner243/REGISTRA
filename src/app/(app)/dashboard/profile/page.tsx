import type { Metadata } from "next"
import type { User } from "@supabase/supabase-js"

import { getCurrentUser } from "@/lib/auth/session"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export const metadata: Metadata = {
  title: "Profil",
}

function getInitials(user: User): string {
  const name = (user.user_metadata?.name as string | undefined)?.trim()
  const email = user.email ?? ""
  const source = name || email
  return (source.charAt(0) || "?").toUpperCase()
}

export default async function ProfilePage() {
  const user = await getCurrentUser()

  const email = user?.email ?? ""
  const name = (user?.user_metadata?.name as string | undefined)?.trim() || ""

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Profile"
        description="Vos informations personnelles."
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="lg:w-72 lg:shrink-0">
          <CardHeader className="items-center text-center">
            <Avatar size="lg">
              <AvatarFallback className="text-base">
                {user ? getInitials(user) : "?"}
              </AvatarFallback>
            </Avatar>
            <CardTitle>{name || "Utilisateur"}</CardTitle>
            <CardDescription className="break-all">{email}</CardDescription>
          </CardHeader>
        </Card>

        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Informations du compte</CardTitle>
            <CardDescription>
              Ces informations proviennent de votre session.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-name">Nom</Label>
              <Input
                id="profile-name"
                type="text"
                defaultValue={name}
                placeholder="Votre nom"
                className="max-w-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                readOnly
                className="max-w-sm"
              />
              <p className="text-xs text-muted-foreground">
                L&apos;email est récupéré depuis votre session et ne peut pas
                être modifié ici.
              </p>
            </div>
            <div className="mt-2">
              <Button type="button" disabled title="Sauvegarde à venir">
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
