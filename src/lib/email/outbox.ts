import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin"

export interface OutboxRow {
  id: string
  type: string
  recipient: string
  subject: string
  body_html: string
  body_text: string | null
  attempts: number
  next_attempt_at: string
  last_error: string | null
}

export interface QueueEmailInput {
  type: string
  referenceId: string
  recipient: string
  subject: string
  html: string
  text?: string
  payload?: Record<string, unknown>
}

export interface OutboxClient {
  /** Vrai quand la file persistante est disponible (service_role configuré). */
  isAvailable(): boolean
  /**
   * Met en file de façon idempotente. Retourne l'id de la ligne nouvellement
   * insérée, ou `null` si (type, reference_id) existait déjà.
   */
  queue(input: QueueEmailInput): Promise<string | null>
  /** Réclame un lot d'emails dus (queued/failed), les passe en processing. */
  claimDue(limit: number): Promise<OutboxRow[]>
  markSent(id: string): Promise<void>
  markFailed(id: string, error: string, attempts: number): Promise<void>
}

/**
 * Outbox persistante côté Supabase (`service_role`).
 *
 * La base reste la source de vérité : insertion idempotente via
 * `unique(type, reference_id)`, claim concurrent sans doublon via
 * `for update skip locked` (voir migration 20260907000004).
 */
export class SupabaseOutbox implements OutboxClient {
  isAvailable(): boolean {
    return isSupabaseAdminConfigured()
  }

  async queue(input: QueueEmailInput): Promise<string | null> {
    const client = await createSupabaseAdminClient()
    if (!client) {
      return null
    }

    const { data, error } = await client.rpc("queue_email", {
      p_type: input.type,
      p_reference_id: input.referenceId,
      p_recipient: input.recipient,
      p_subject: input.subject,
      p_body_html: input.html,
      p_body_text: input.text ?? null,
      p_payload: (input.payload ?? {}) as object,
    })

    if (error) {
      throw new Error(`queue_email: ${error.message}`)
    }

    if (data === null || typeof data !== "string") {
      return null
    }

    return data
  }

  async claimDue(limit: number): Promise<OutboxRow[]> {
    const client = await createSupabaseAdminClient()
    if (!client) {
      return []
    }

    const { data, error } = await client.rpc("claim_email_batch", {
      p_limit: limit,
    })

    if (error) {
      throw new Error(`claim_email_batch: ${error.message}`)
    }

    return ((data ?? []) as OutboxRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      recipient: row.recipient,
      subject: row.subject,
      body_html: row.body_html,
      body_text: row.body_text,
      attempts: row.attempts,
      next_attempt_at: row.next_attempt_at,
      last_error: row.last_error,
    }))
  }

  async markSent(id: string): Promise<void> {
    const client = await createSupabaseAdminClient()
    if (!client) {
      return
    }
    const { error } = await client.rpc("mark_email_sent", { p_id: id })
    if (error) {
      throw new Error(`mark_email_sent: ${error.message}`)
    }
  }

  async markFailed(id: string, error: string, attempts: number): Promise<void> {
    const client = await createSupabaseAdminClient()
    if (!client) {
      return
    }
    const { error: rpcError } = await client.rpc("mark_email_failed", {
      p_id: id,
      p_error: error,
      p_next_attempt_at: nextRetryAt(attempts),
    })
    if (rpcError) {
      throw new Error(`mark_email_failed: ${rpcError.message}`)
    }
  }
}

/**
 * Fenêtre de la prochaine tentative après un échec : escalade exponentielle
 * 1 min → 24 h (plafonnée). La file n'est jamais bloquée définitivement.
 */
export function nextRetryAt(attempts: number): string {
  const delayMs = Math.min(60_000 * 2 ** Math.min(attempts - 1, 10), 86_400_000)
  return new Date(Date.now() + delayMs).toISOString()
}