import type { Metadata } from "next"
import Link from "next/link"

import { listUserOrganizations } from "@/lib/orgs"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { InviteMemberForm } from "@/components/dashboard/invite-member-form"
import { RevokeInvitationButton } from "@/components/dashboard/revoke-invitation-button"
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
  title: "Équipe",
}

const ROLE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
}

async function getTeamData(organizationId: string) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { members: [], invitations: [] }
  }

  const [membersResult, invitationsResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, user_id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, created_at")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ])

  return {
    members: membersResult.data ?? [],
    invitations: invitationsResult.data ?? [],
    membersError: membersResult.error,
    invitationsError: invitationsResult.error,
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(value))
}

export default async function TeamPage() {
  const organizations = await listUserOrganizations()

  if (organizations.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Équipe"
          description="Gérez les membres de votre organisation."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Vous n&apos;appartenez pas encore à une organisation. Acceptez une
              invitation pour apparaître ici.
            </p>
            <Button render={<Link href="/dashboard" />}>
              Retour au tableau de bord
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // UI de départ : la première organisation de l'utilisateur. La sélection
  // multi-organisations est une évolution documentée (voir docs/email.md,
  // section « Organisation active »).
  const organization = organizations[0]
  const { members, invitations, membersError } = await getTeamData(organization.id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Équipe"
        description={`Organisation : ${organization.name}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Inviter un membre</CardTitle>
          <CardDescription>
              L&apos;invité reçoit un lien par email (valable 7 jours) et rejoint
              l&apos;organisation en l&apos;acceptant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteMemberForm organizationId={organization.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membres</CardTitle>
          <CardDescription>
            {members.length} membre{members.length > 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersError ? (
            <p className="text-sm text-destructive">
              Impossible de charger les membres.
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun membre.</p>
          ) : (
            <ul className="divide-y">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {String(member.user_id).slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Membre depuis le {formatDate(member.created_at)}
                    </span>
                  </div>
                  <Badge variant={ROLE_BADGE[member.role] ?? "outline"}>
                    {ROLE_LABEL[member.role] ?? member.role}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations en attente</CardTitle>
          <CardDescription>
            Les invitations peuvent être révoquées à tout moment avant
            acceptation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune invitation en attente.
            </p>
          ) : (
            <ul className="divide-y">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{invitation.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {ROLE_LABEL[invitation.role] ?? invitation.role} · envoyée le{" "}
                      {formatDate(invitation.created_at)}
                    </span>
                  </div>
                  <RevokeInvitationButton
                    organizationId={organization.id}
                    invitationId={invitation.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}