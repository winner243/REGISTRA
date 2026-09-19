import { processDueEmails } from "@/lib/email"
import { JobProcessResult, ClaimedJob } from "./types"

/** Handlers pour chaque queue — le futur SaaS étend cet objet. */
export const jobQueueHandlers: Record<string, (job: ClaimedJob) => Promise<JobProcessResult>> = {
  /** Queue emails : réutilise le worker email existant. */
  emails: async (job) => {
    const batchSize = (job.payload.batchSize as number) ?? 10
    const report = await processDueEmails(batchSize)

    if (report.delivered > 0 || report.failed === 0) {
      return { success: true, output: report }
    }
    // Certains ont échoué — le worker email gère déjà les retries via markFailed
    // On retourne success pour ne pas re-retry au niveau job générique
    return { success: true, output: report }
  },

  /** Queue exports : génération d'exports (CSV/JSON) — à implémenter par le futur SaaS. */
  exports: async (job) => {
    const { exportId, format, organizationId } = job.payload as {
      exportId: string
      format: "csv" | "json"
      organizationId: string
    }

    // TODO: Implémenter la génération d'export réelle
    // Pour l'instant, on simule un succès
    console.log(`[jobs/exports] Export ${exportId} (${format}) pour org ${organizationId}`)

    return { success: true, output: { exportId, format, status: "completed" } }
  },

  /** Queue notifications : envoi notifications push/email — à implémenter par le futur SaaS. */
  notifications: async (job) => {
    const { notificationId, userId, channels } = job.payload as {
      notificationId: string
      userId: string
      channels: ("in_app" | "email" | "push")[]
    }

    // TODO: Implémenter l'envoi réel (email via EmailService, push futur)
    console.log(`[jobs/notifications] Notification ${notificationId} pour user ${userId} via ${channels.join(", ")}`)

    return { success: true, output: { notificationId, channels } }
  },

  /** Queue webhooks : envoi webhooks sortants — à implémenter par le futur SaaS. */
  webhooks: async (job) => {
    const { webhookId, url } = job.payload as {
      webhookId: string
      url: string
      payload: Record<string, unknown>
      secret?: string
    }

    // TODO: Implémenter l'envoi webhook avec signature, retry, idempotence
    // Ne jamais logger le secret ou le payload complet
    console.log(`[jobs/webhooks] Webhook ${webhookId} vers ${url}`)

    return { success: true, output: { webhookId, delivered: true } }
  },

  /** Queue billing : synchronisation abonnements, facturation — à implémenter par le futur SaaS. */
  billing: async (job) => {
    const { action, organizationId } = job.payload as {
      action: "sync_subscription" | "process_usage" | "generate_invoice"
      organizationId: string
      subscriptionId?: string
    }

    // TODO: Implémenter les actions billing réelles
    // Ne pas logger les données sensibles (subscriptionId, etc.)
    console.log(`[jobs/billing] Action ${action} pour org ${organizationId}`)

    return { success: true, output: { action, organizationId } }
  },

  /** Queue cleanup : tâches de maintenance (purge logs, fichiers orphelins, etc.). */
  cleanup: async (job) => {
    const { task, olderThanDays } = job.payload as {
      task: "purge_job_logs" | "purge_exports" | "purge_orphan_files"
      olderThanDays?: number
    }

    // TODO: Implémenter les tâches de cleanup réelles
    console.log(`[jobs/cleanup] Tâche ${task} (olderThanDays: ${olderThanDays ?? "default"})`)

    return { success: true, output: { task } }
  },
}