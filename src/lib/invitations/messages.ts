/**
 * Traduction des codes d'erreur SQL en messages utilisateur.
 * Les fonctions RPC (`create_invitation`, `accept_invitation`,
 * `revoke_invitation`) lèvent des exceptions avec pour message le code.
 * PostgREST renvoie ce message tel quel dans `error.message`.
 */
const MESSAGES: Record<string, string> = {
  insufficient_permission:
    "Vous n'avez pas la permission de gérer les membres de cette organisation.",
  unknown_role: "Rôle inconnu.",
  ownership_via_invitation_forbidden:
    "Impossible d'inviter un propriétaire. Le rôle `owner` se transfère depuis l'équipe.",
  invitation_already_pending:
    "Une invitation est déjà en attente pour cette adresse email.",
  invitation_invalid: "Invitation invalide, déjà utilisée ou révoquée.",
  invitation_expired:
    "Cette invitation a expiré. Demandez à un administrateur d'en créer une nouvelle.",
  account_required:
    "Aucun compte n'existe pour cette adresse email. Créez-en un, puis réessayez.",
  already_member: "Cette personne est déjà membre de l'organisation.",
  cannot_remove_last_owner: "Impossible de retirer le dernier propriétaire.",
  cannot_demote_last_owner: "Impossible de rétrograder le dernier propriétaire.",
}

/**
 * Mappe l'erreur RPC vers un message utilisateur ; `null` si le code est
 * inconnu (l'appelant retombe sur un message générique).
 */
export function mapInvitationError(
  error: { message?: string } | null | undefined,
): string | null {
  if (!error?.message) {
    return null
  }
  const firstLine = error.message.trim().split("\n")[0]
  return MESSAGES[firstLine] ?? null
}