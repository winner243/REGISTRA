/** Noms des queues supportées — extensible par migration SQL. */
export type JobQueueName =
  | "emails"
  | "exports"
  | "notifications"
  | "webhooks"
  | "billing"
  | "cleanup"

/** Statuts possibles d'un job. */
export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"

/** Clé d'idempotence pour un job — fournie par l'appelant. */
export type IdempotencyKey = string & { readonly __brand: unique symbol }

/** Payload générique pour un job — données minimales non sensibles. */
export interface JobPayload {
  readonly [key: string]: unknown
}

/** Options pour la mise en file. */
export interface QueueJobOptions {
  /** File cible. */
  queue: JobQueueName
  /** Clé d'idempotence fournie par l'appelant. */
  idempotencyKey: IdempotencyKey
  /** Payload du job (non sensible). */
  payload?: JobPayload
  /** Nombre max de tentatives (défaut: 3). */
  maxAttempts?: number
  /** Exécution différée (scheduled_at). */
  scheduledAt?: Date
}

/** Résultat de mise en file. */
export interface QueueJobResult {
  /** ID du job créé, ou null si idempotency_key existait déjà. */
  jobId: string | null
  /** True si le job existait déjà (idempotence). */
  alreadyQueued: boolean
}

/** Job récupéré par le worker pour traitement. */
export interface ClaimedJob {
  id: string
  queue: JobQueueName
  idempotencyKey: string
  payload: JobPayload
  attempts: number
  maxAttempts: number
  scheduledAt: Date
}

/** Résultat du traitement d'un job par le worker. */
export type JobProcessResult =
  | { success: true; output?: unknown }
  | { success: false; error: string; retryable: boolean }

/** Configuration du worker pour une queue. */
export interface WorkerConfig {
  /** Nom de la queue. */
  queue: JobQueueName
  /** Taille du lot par exécution. */
  batchSize: number
  /** Timeout d'exécution du handler (ms). */
  handlerTimeoutMs: number
  /** Backoff de base pour retry (ms). */
  baseBackoffMs: number
  /** Backoff max pour retry (ms). */
  maxBackoffMs: number
  /** Handler qui exécute le job. */
  handler: (job: ClaimedJob) => Promise<JobProcessResult>
}

/** Rapport d'exécution du worker. */
export interface WorkerReport {
  queue: JobQueueName
  claimed: number
  succeeded: number
  failed: number
  errors: string[]
}

/** Statistiques d'une queue. */
export interface QueueStats {
  queue: JobQueueName
  pending: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  oldestPendingAt: Date | null
}

/** Ligne de job brute (depuis la DB). */
export interface JobRow {
  id: string
  queue_name: JobQueueName
  idempotency_key: string
  status: JobStatus
  payload: Record<string, unknown>
  error: string | null
  attempts: number
  max_attempts: number
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  cancelled_at: string | null
  next_attempt_at: string | null
  created_at: string
  updated_at: string
}

/** Job typé pour l'application. */
export interface Job {
  id: string
  queue: JobQueueName
  idempotencyKey: string
  status: JobStatus
  payload: Record<string, unknown>
  error: string | null
  attempts: number
  maxAttempts: number
  scheduledAt: Date
  startedAt: Date | null
  completedAt: Date | null
  failedAt: Date | null
  cancelledAt: Date | null
  nextAttemptAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** Ligne de log de job (sanitized). */
export interface JobLogRow {
  id: string
  job_id: string
  queue_name: JobQueueName
  status: JobStatus
  attempt: number
  error: string | null
  duration_ms: number | null
  created_at: string
}

/** Tâche cron (registry). */
export interface CronTaskRow {
  name: string
  description: string
  queue_name: JobQueueName
  schedule: string
  timezone: string
  payload: Record<string, unknown>
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

/** Exécution cron (historique). */
export interface CronExecutionRow {
  id: string
  task_name: string
  status: "success" | "failed" | "skipped"
  job_id: string | null
  error: string | null
  duration_ms: number | null
  created_at: string
}

/** Payload attendu pour une tâche cron (dans cron_tasks.payload). */
export interface CronTaskPayload {
  /** Pattern pour générer l'idempotency_key (ex. "cron:email-outbox:%Y%m%d%H%M"). */
  idempotency_key_pattern: string
  /** Max attempts pour le job créé. */
  max_attempts?: number
  /** Batch size pour le worker (si applicable). */
  batch_size?: number
  /** Payload additionnel passé au job. */
  job_payload?: Record<string, unknown>
}

/** Erreurs du système de jobs. */
export class JobsError extends Error {
  readonly code: string
  readonly cause?: unknown

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = "JobsError"
    this.code = code
    this.cause = options?.cause
  }
}

/** Codes d'erreur jobs. */
export type JobsErrorCode =
  | "queue-unavailable"
  | "job-not-found"
  | "job-already-processing"
  | "job-not-pending"
  | "max-attempts-exceeded"
  | "handler-timeout"
  | "handler-error"
  | "invalid-queue"
  | "invalid-schedule"
  | "cron-unauthorized"
  | "cron-secret-missing"