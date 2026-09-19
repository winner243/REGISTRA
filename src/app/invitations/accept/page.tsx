import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth/session"
import { acceptInvitation } from "@/lib/invitations/actions"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Accepter l'invitation",
}

function InvitationResult({
  status,
  message,
}: {
  status: "error" | "success"
  message: string
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className={`text-sm font-medium ${
          status === "error" ? "text-destructive" : "text-foreground"
        }`}
      >
        {message}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Retour au tableau de bord
        </Button>
      </div>
    </div>
  )
}

/**
 * Acceptation d'une invitation par lien de l'email.
 *
 * Le token voyage en query string (`/invitations/accept?token=…`) : compromis
 * documenté, acceptable pour ce flux — le token est usage unique et expire
 * après 7 jours, et le locataire peut basculer sur un hash-fragment (SPA)
 * sans rien changer côté base. Voir `documentation/decisions.md`.
 *
 * Utilisateur non connecté → redirigé vers `/login?next=…` (le login reverse
 * ensuite vers cette page grâce au paramètre `next`).
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <InvitationResult status="error" message="Lien d'invitation invalide." />
  }

  const user = await getCurrentUser()
  if (!user) {
    const next = `/invitations/accept?token=${encodeURIComponent(token)}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  const result = await acceptInvitation(token)
  if ("error" in result) {
    return <InvitationResult status="error" message={result.error} />
  }

  return (
    <InvitationResult
      status="success"
      message="Invitation acceptée. Bienvenue dans votre nouvelle équipe !"
    />
  )
}