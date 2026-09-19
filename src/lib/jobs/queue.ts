import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin"
import { JobsError } from "./types"
import type {
  JobQueueName,
  JobStatus,
  JobRow,
  JobLogRow,
  CronTaskRow,
  CronExecutionRow,
  QueueJobOptions,
  QueueJobResult,
  ClaimedJob,
  WorkerConfig,
  WorkerReport,
  QueueStats,
  JobProcessResult,
  IdempotencyKey,
} from "./types"
import { withTimeout } from "@/lib/resilience"

/** Client pour la file de jobs (implémentation Supabase). */
export class SupabaseJobQueue {
  private adminClientPromise: ReturnType<typeof createSupabaseAdminClient>

  constructor() {
    this.adminClientPromise = createSupabaseAdminClient()
  }

  private async getAdmin() {
    const client = await this.adminClientPromise
    if (!client) {
      throw new JobsError("queue-unavailable", "Service role non configuré — file jobs indisponible.")
    }
    return client
  }

  /** Vérifie si la file est disponible (service_role configuré). */
  isAvailable(): boolean {
    return isSupabaseAdminConfigured()
  }

  /** Met un job en file de façon idempotente. */
  async queue(options: QueueJobOptions): Promise<QueueJobResult> {
    const admin = await this.getAdmin()

    const { data, error } = await admin.rpc("queue_job", {
      p_queue_name: options.queue,
      p_idempotency_key: options.idempotencyKey,
      p_payload: options.payload ?? {},
      p_max_attempts: options.maxAttempts ?? 3,
      p_scheduled_at: options.scheduledAt?.toISOString() ?? new Date().toISOString(),
    })

    if (error) {
      throw new JobsError("queue-unavailable", `queue_job: ${error.message}`, { cause: error })
    }

    const jobId = data as string | null
    return {
      jobId,
      alreadyQueued: jobId === null,
    }
  }

  /** Réclame un lot de jobs dus pour une queue. */
  async claimBatch(queue: JobQueueName, limit: number): Promise<ClaimedJob[]> {
    const admin = await this.getAdmin()

    const { data, error } = await admin.rpc("claim_job_batch", {
      p_queue_name: queue,
      p_limit: limit,
    })

    if (error) {
      throw new JobsError("queue-unavailable", `claim_job_batch: ${error.message}`, { cause: error })
    }

    return ((data ?? []) as JobRow[]).map(this.mapClaimedJob)
  }

  /** Marque un job comme terminé avec succès. */
  async markCompleted(jobId: string): Promise<void> {
    const admin = await this.getAdmin()
    const { error } = await admin.rpc("mark_job_completed", { p_id: jobId })
    if (error) {
      throw new JobsError("queue-unavailable", `mark_job_completed: ${error.message}`, { cause: error })
    }
  }

  /** Marque un job en échec (planifie retry ou failed définitif). */
  async markFailed(jobId: string, error: string, nextAttemptAt: Date): Promise<void> {
    const admin = await this.getAdmin()
    const { error: rpcError } = await admin.rpc("mark_job_failed", {
      p_id: jobId,
      p_error: error,
      p_next_attempt_at: nextAttemptAt.toISOString(),
    })
    if (rpcError) {
      throw new JobsError("queue-unavailable", `mark_job_failed: ${rpcError.message}`, { cause: rpcError })
    }
  }

  /** Annule un job en attente. */
  async cancel(jobId: string): Promise<boolean> {
    const admin = await this.getAdmin()
    const { data, error } = await admin.rpc("cancel_job", { p_id: jobId })
    if (error) {
      throw new JobsError("queue-unavailable", `cancel_job: ${error.message}`, { cause: error })
    }
    return data as boolean
  }

  /** Enregistre une transition de job (log sanitized). */
  async logTransition(
    jobId: string,
    queue: JobQueueName,
    status: JobStatus,
    attempt: number,
    error: string | null,
    durationMs: number | null,
  ): Promise<void> {
    const admin = await this.getAdmin()
    const { error: rpcError } = await admin.rpc("log_job_transition", {
      p_job_id: jobId,
      p_queue_name: queue,
      p_status: status,
      p_attempt: attempt,
      p_error: error,
      p_duration_ms: durationMs,
    })
    if (rpcError) {
      // Log non bloquant
      console.error("[jobs] log transition failed:", rpcError)
    }
  }

  /** Récupère les stats d'une queue. */
  async getStats(queue: JobQueueName): Promise<QueueStats> {
    const admin = await this.getAdmin()

    const { data, error } = await admin
      .from("jobs")
      .select("status")
      .eq("queue_name", queue)

    if (error) {
      throw new JobsError("queue-unavailable", `stats: ${error.message}`, { cause: error })
    }

    const counts = (data ?? []).reduce(
      (acc, row) => {
        const status = row.status as JobStatus
        acc[status] = (acc[status] ?? 0) + 1
        return acc
      },
      {} as Record<JobStatus, number>,
    )

    // Oldest pending
    const { data: oldest } = await admin
      .from("jobs")
      .select("created_at")
      .eq("queue_name", queue)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)

    return {
      queue,
      pending: counts.pending ?? 0,
      processing: counts.processing ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      cancelled: counts.cancelled ?? 0,
      oldestPendingAt: oldest?.[0]?.created_at ? new Date(oldest[0].created_at) : null,
    }
  }

  /** Récupère les jobs définitivement échoués (failed + attempts >= max_attempts). */
  async getFailedJobs(queue?: JobQueueName, limit = 50): Promise<JobRow[]> {
    const admin = await this.getAdmin()

    let query = admin
      .from("jobs")
      .select("*")
      .eq("status", "failed")

    if (queue) {
      query = query.eq("queue_name", queue)
    }

    query = query.order("failed_at", { ascending: false }).limit(limit)

    const { data, error } = await query

    if (error) {
      throw new JobsError("queue-unavailable", `getFailedJobs: ${error.message}`, { cause: error })
    }

    return (data ?? []) as JobRow[]
  }

  /** Récupère les logs d'un job. */
  async getJobLogs(jobId: string, limit = 100): Promise<JobLogRow[]> {
    const admin = await this.getAdmin()

    const { data, error } = await admin
      .from("job_logs")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      throw new JobsError("queue-unavailable", `getJobLogs: ${error.message}`, { cause: error })
    }

    return (data ?? []) as JobLogRow[]
  }

  /** Liste les tâches cron (catalogue public). */
  async listCronTasks(): Promise<CronTaskRow[]> {
    const admin = await this.getAdmin()

    const { data, error } = await admin
      .from("cron_tasks")
      .select("*")
      .order("name")

    if (error) {
      throw new JobsError("queue-unavailable", `listCronTasks: ${error.message}`, { cause: error })
    }

    return (data ?? []) as CronTaskRow[]
  }

  /** Récupère une tâche cron par nom. */
  async getCronTask(name: string): Promise<CronTaskRow | null> {
    const admin = await this.getAdmin()

    const { data, error } = await admin
      .from("cron_tasks")
      .select("*")
      .eq("name", name)
      .maybeSingle()

    if (error) {
      throw new JobsError("queue-unavailable", `getCronTask: ${error.message}`, { cause: error })
    }

    return (data as CronTaskRow | null) ?? null
  }

  /** Enregistre une exécution cron. */
  async markCronExecution(
    taskName: string,
    status: "success" | "failed" | "skipped",
    jobId: string | null,
    error: string | null,
    durationMs: number | null,
  ): Promise<void> {
    const admin = await this.getAdmin()
    const { error: rpcError } = await admin.rpc("mark_cron_execution", {
      p_task_name: taskName,
      p_status: status,
      p_job_id: jobId,
      p_error: error,
      p_duration_ms: durationMs,
    })
    if (rpcError) {
      console.error("[jobs] markCronExecution failed:", rpcError)
    }
  }

  /** Récupère l'historique d'exécution d'une tâche cron. */
  async getCronExecutions(taskName: string, limit = 50): Promise<CronExecutionRow[]> {
    const admin = await this.getAdmin()

    const { data, error } = await admin
      .from("cron_executions")
      .select("*")
      .eq("task_name", taskName)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      throw new JobsError("queue-unavailable", `getCronExecutions: ${error.message}`, { cause: error })
    }

    return (data ?? []) as CronExecutionRow[]
  }

  private mapClaimedJob(row: JobRow): ClaimedJob {
    return {
      id: row.id,
      queue: row.queue_name,
      idempotencyKey: row.idempotency_key,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      scheduledAt: new Date(row.scheduled_at),
    }
  }
}

/** Instance partagée de la queue. */
export const jobQueue = new SupabaseJobQueue()

/** Génère la prochaine date de retry avec backoff exponentiel (1min → 24h max). */
export function computeNextRetryAt(attempt: number): Date {
  const delayMs = Math.min(60_000 * 2 ** Math.min(attempt - 1, 10), 86_400_000)
  return new Date(Date.now() + delayMs)
}

/** Worker générique pour une queue. */
export async function runWorker(config: WorkerConfig): Promise<WorkerReport> {
  const queue = jobQueue
  const report: WorkerReport = {
    queue: config.queue,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  }

  const jobs = await queue.claimBatch(config.queue, config.batchSize)
  report.claimed = jobs.length

  for (const job of jobs) {
    const startTime = Date.now()
    let result: JobProcessResult

    try {
      // Exécution avec timeout + retry interne si handler le supporte
      result = await withTimeout(
        config.handler(job),
        config.handlerTimeoutMs,
        `Job ${job.id} timeout après ${config.handlerTimeoutMs}ms`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result = { success: false, error: message, retryable: true }
    }

    const durationMs = Date.now() - startTime

    if (result.success) {
      await queue.markCompleted(job.id)
      await queue.logTransition(job.id, config.queue, "completed", job.attempts, null, durationMs)
      report.succeeded++
    } else {
      const { error, retryable } = result
      const nextAttemptAt = retryable && job.attempts < job.maxAttempts
        ? computeNextRetryAt(job.attempts)
        : new Date("2099-12-31") // Échec définitif : date lointaine = plus de retry

      await queue.markFailed(job.id, error, nextAttemptAt)
      const finalStatus = retryable && job.attempts < job.maxAttempts ? "failed" : "failed"
      await queue.logTransition(job.id, config.queue, finalStatus, job.attempts, error, durationMs)
      report.failed++
      report.errors.push(`${job.id}: ${error}`)
    }
  }

  return report
}

/** Crée une clé d'idempotence typée. */
export function makeIdempotencyKey(key: string): IdempotencyKey {
  return key as IdempotencyKey
}