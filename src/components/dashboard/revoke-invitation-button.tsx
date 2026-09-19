"use client"

import { useActionState } from "react"

import { revokeInvitation, type InvitationActionState } from "@/lib/invitations/actions"
import { Button } from "@/components/ui/button"

const initialState: InvitationActionState = null

export function RevokeInvitationButton({
  organizationId,
  invitationId,
}: {
  organizationId: string
  invitationId: string
}) {
  const [state, formAction, pending] = useActionState(revokeInvitation, initialState)

  return (
    <form action={formAction}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Révocation…" : "Révoquer"}
      </Button>
      {state?.error && (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      )}
      {state?.success && (
        <span className="ml-2 text-xs text-muted-foreground">{state.success}</span>
      )}
    </form>
  )
}