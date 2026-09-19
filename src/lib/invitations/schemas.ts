import { z } from "zod"

import { emailSchema } from "@/lib/validation"

/** Rôles invivables. `owner` est exclu : il est créé par l'organisation ou transféré. */
export const INVITABLE_ROLES = ["admin", "member"] as const

export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export const inviteSchema = z.object({
  organizationId: z.string().uuid("Organisation invalide."),
  email: emailSchema,
  role: z.enum(INVITABLE_ROLES, "Rôle invalide."),
})

export const revokeInvitationSchema = z.object({
  organizationId: z.string().uuid("Organisation invalide."),
  invitationId: z.string().uuid("Invitation invalide."),
})

export type InviteInput = z.infer<typeof inviteSchema>
export type RevokeInvitationInput = z.infer<typeof revokeInvitationSchema>