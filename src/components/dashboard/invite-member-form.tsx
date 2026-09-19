"use client"

import { useActionState } from "react"

import { inviteMember, type InvitationActionState } from "@/lib/invitations/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const initialState: InvitationActionState = null

export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(inviteMember, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">Adresse email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="off"
          placeholder="membre@exemple.com"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">Rôle</Label>
        <Select name="role" defaultValue="member">
          <SelectTrigger id="invite-role" className="w-full">
            <SelectValue placeholder="Choisir un rôle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Membre</SelectItem>
            <SelectItem value="admin">Administrateur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state?.error && (
        <Alert variant="destructive" className="py-2.5">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.success && (
        <Alert className="py-2.5">
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Envoi…" : "Inviter"}
      </Button>
    </form>
  )
}