import { ExportError } from "./errors"

export type CanExport = (ctx: { userId: string }) => boolean | Promise<boolean>

/**
 * Porte d'entrée d'autorisation d'un export. Le Starter ne fait jamais
 * confiance au client pour l'identité : le `userId` provient d'une session
 * vérifiée côté serveur (ex. `getCurrentUser()`), et le droit d'accès est
 * évalué par la fonction `can` fournie par le SaaS (ownership, RLS, plan…).
 *
 * - pas d'utilisateur → `unauthorized` (401) ;
 * - utilisateur connu mais sans droit → `forbidden` (403).
 */
export async function ensureCanExport(
  userId: string | null | undefined,
  can?: CanExport,
): Promise<void> {
  if (!userId) {
    throw new ExportError("unauthorized", "Authentification requise pour exporter.")
  }

  if (can && !(await can({ userId }))) {
    throw new ExportError(
      "forbidden",
      "Autorisation refusée pour cet export.",
    )
  }
}