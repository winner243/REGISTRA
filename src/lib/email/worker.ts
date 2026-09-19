import { SupabaseOutbox } from "@/lib/email/outbox"
import { getDefaultEmailProvider } from "@/lib/email/providers"
import { deliverMessage, describeEmailError } from "@/lib/email/service"
import type { EmailMessage } from "@/lib/email/types"

export interface OutboxWorkerReport {
  processed: number
  delivered: number
  failed: number
}

/**
 * Worker de la file outbox : réclame un lot d'emails dus, tente l'envoi
 * (timeout + retries), puis marque chaque ligne sent / failed. Un échec
 * planifie une re-tentative automatique via `next_attempt_at` (backoff).
 *
 * À appeler par le cron interne (`/api/cron/email-outbox`) — jamais exposé
 * au client.
 */
export async function processDueEmails(
  batchSize = 10,
  config: { sendTimeoutMs?: number; sendAttempts?: number } = {},
): Promise<OutboxWorkerReport> {
  const outbox = new SupabaseOutbox()
  const rows = await outbox.claimDue(batchSize)

  const provider = getDefaultEmailProvider()
  const report: OutboxWorkerReport = { processed: rows.length, delivered: 0, failed: 0 }

  for (const row of rows) {
    const message: EmailMessage = {
      to: row.recipient,
      subject: row.subject,
      html: row.body_html,
      text: row.body_text ?? undefined,
    }

    try {
      await deliverMessage(provider, message, config)
      await outbox.markSent(row.id)
      report.delivered += 1
    } catch (error) {
      try {
        await outbox.markFailed(row.id, describeEmailError(error), row.attempts)
      } catch (markError) {
        // Le batch continue : une ligne dont le marquage échoue restera
        // "processing" bloquée ; signalée au rapport pour investigation.
        console.error(`[email] marquage échec (${row.id}):`, markError)
      }
      report.failed += 1
    }
  }

  return report
}