import { jobQueue, runWorker, makeIdempotencyKey } from "./queue"
import { jobQueueHandlers } from "./handlers"
import { JobsError } from "./types"
import type { WorkerConfig, JobQueueName, ClaimedJob, JobProcessResult } from "./types"

/** Handler pour une tâche cron — crée un job via queue_job. */
export interface CronTaskHandler {
  /** Nom de la tâche (doit matcher cron_tasks.name). */
  taskName: string
  /** Queue cible. */
  queue: JobQueueName
  /** Génère l'idempotency_key pour cette exécution (ex. avec timestamp window). */
  generateIdempotencyKey: (taskName: string, now: Date) => string
  /** Prépare le payload du job. */
  preparePayload: (taskPayload: Record<string, unknown>) => Record<string, unknown>
  /** Max attempts pour le job. */
  maxAttempts?: number
  /** Batch size pour le worker (si applicable). */
  batchSize?: number
}

/** Registre des handlers de tâches cron — étendu par le futur SaaS. */
export const cronTaskHandlers: CronTaskHandler[] = [
  {
    taskName: "email-outbox",
    queue: "emails",
    generateIdempotencyKey: (_, now) => `cron:email-outbox:${now.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`,
    preparePayload: (taskPayload) => ({
      batchSize: (taskPayload.batch_size as number) ?? 10,
    }),
    maxAttempts: 3,
    batchSize: 10,
  },
  // Le futur SaaS ajoute ses tâches ici ou via un fichier de config dédié
]

/** Exécute une tâche cron par nom. */
export async function executeCronTask(taskName: string): Promise<{ success: boolean; jobId: string | null; error?: string }> {
  const handler = cronTaskHandlers.find((h) => h.taskName === taskName)
  if (!handler) {
    throw new JobsError("invalid-queue", `Tâche cron inconnue : ${taskName}`)
  }

  const task = await jobQueue.getCronTask(taskName)
  if (!task) {
    throw new JobsError("invalid-queue", `Tâche cron non trouvée en base : ${taskName}`)
  }
  if (!task.enabled) {
    return { success: true, jobId: null } // skipped
  }

  const now = new Date()
  const idempotencyKey = handler.generateIdempotencyKey(taskName, now)
  const payload = handler.preparePayload(task.payload as Record<string, unknown>)

  const result = await jobQueue.queue({
    queue: handler.queue,
    idempotencyKey: makeIdempotencyKey(idempotencyKey),
    payload,
    maxAttempts: handler.maxAttempts ?? 3,
    scheduledAt: now,
  })

  if (result.alreadyQueued) {
    // Job déjà en file pour cette fenêtre — idempotence
    return { success: true, jobId: result.jobId }
  }

  return { success: true, jobId: result.jobId }
}

/** Exécute le worker pour une queue (appelé par /api/cron/run?worker=queue). */
export async function executeWorker(queueName: JobQueueName): Promise<ReturnType<typeof runWorker>> {
  const handlerConfig = getWorkerConfig(queueName)
  return runWorker(handlerConfig)
}

/** Configuration du worker par queue (centralisée). */
function getWorkerConfig(queue: JobQueueName): WorkerConfig {
  const baseConfig: WorkerConfig = {
    queue,
    batchSize: 10,
    handlerTimeoutMs: 30_000,
    baseBackoffMs: 1_000,
    maxBackoffMs: 60_000,
    handler: async (job: ClaimedJob): Promise<JobProcessResult> => {
      const handler = jobQueueHandlers[queue]
      if (!handler) {
        return { success: false, error: `Aucun handler pour queue ${queue}`, retryable: false }
      }
      return handler(job)
    },
  }

  // Overrides par queue
  switch (queue) {
    case "emails":
      return { ...baseConfig, batchSize: 10, handlerTimeoutMs: 30_000 }
    case "exports":
      return { ...baseConfig, batchSize: 3, handlerTimeoutMs: 120_000 }
    case "notifications":
      return { ...baseConfig, batchSize: 20, handlerTimeoutMs: 15_000 }
    case "webhooks":
      return { ...baseConfig, batchSize: 10, handlerTimeoutMs: 30_000 }
    case "billing":
      return { ...baseConfig, batchSize: 5, handlerTimeoutMs: 60_000 }
    case "cleanup":
      return { ...baseConfig, batchSize: 1, handlerTimeoutMs: 300_000 }
    default:
      return baseConfig
  }
}