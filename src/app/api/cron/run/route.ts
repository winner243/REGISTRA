import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { jobQueue, executeCronTask, executeWorker } from "@/lib/jobs"
import { JobsError } from "@/lib/jobs/types"
import type { JobQueueName } from "@/lib/jobs/types"

export const dynamic = "force-dynamic"

const CRON_SECRET = process.env.CRON_SECRET

/** Queues autorisées pour l'exécution via le endpoint cron. */
const ALLOWED_WORKER_QUEUES: ReadonlySet<string> = new Set(["emails"])

/**
 * Vérification constant-time du token Bearer (protection timing attack).
 */
function verifyBearerToken(auth: string | null, secret: string): boolean {
  if (!auth || !auth.startsWith("Bearer ")) return false
  const token = Buffer.from(auth.slice(7))
  const expected = Buffer.from(secret)
  if (token.length !== expected.length) return false
  return timingSafeEqual(token, expected)
}

/**
 * Endpoint cron unifié — remplace tous les endpoints cron dispersés.
 *
 * Usage:
 *   GET /api/cron/run?task=email-outbox          → crée le job pour la tâche cron
 *   GET /api/cron/run?worker=emails              → exécute le worker pour la queue
 *   GET /api/cron/run?task=email-outbox&runWorker=1 → crée le job ET exécute le worker
 *
 * Sécurité :
 *   - Authentification Bearer via CRON_SECRET (configuré en prod)
 *   - Si CRON_SECRET non défini → 503 (endpoint non exposé sans protection)
 *   - Validation de la tâche/queue contre le registry centralisé
 *   - Worker restreint aux queues autorisées
 */
export async function GET(request: NextRequest) {
  // 1. Vérification configuration cron
  if (!CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "cron not configured" },
      { status: 503 },
    )
  }

  // 2. Authentification Bearer (constant-time comparison)
  const auth = request.headers.get("authorization")
  if (!verifyBearerToken(auth, CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  // 3. Parsing paramètres
  const { searchParams } = new URL(request.url)
  const taskName = searchParams.get("task")
  const workerQueue = searchParams.get("worker")
  const runWorkerFlag = searchParams.get("runWorker") === "1"

  if (!taskName && !workerQueue) {
    return NextResponse.json(
      { ok: false, error: "missing parameter: task or worker required" },
      { status: 400 },
    )
  }

  // 4. Validation de la queue worker contre l'allowlist
  if (workerQueue && !ALLOWED_WORKER_QUEUES.has(workerQueue)) {
    return NextResponse.json(
      { ok: false, error: "worker queue not allowed" },
      { status: 403 },
    )
  }

  const startTime = Date.now()

  try {
    let taskResult: { success: boolean; jobId: string | null; error?: string } | null = null
    let workerReport: Awaited<ReturnType<typeof executeWorker>> | null = null

    // 5. Exécution tâche cron (création job)
    if (taskName) {
      taskResult = await executeCronTask(taskName)

      // Log exécution cron
      await jobQueue.markCronExecution(
        taskName,
        taskResult.success ? "success" : "failed",
        taskResult.jobId,
        taskResult.error ?? null,
        Date.now() - startTime,
      )

      if (!taskResult.success && taskResult.error) {
        return NextResponse.json(
          { ok: false, error: taskResult.error, task: taskName },
          { status: 500 },
        )
      }
    }

    // 6. Exécution worker (traitement jobs) — queues restreintes
    if (workerQueue || runWorkerFlag) {
      const queue = workerQueue ?? (taskResult?.jobId ? "emails" : null)
      if (!queue || !ALLOWED_WORKER_QUEUES.has(queue)) {
        return NextResponse.json(
          { ok: false, error: "worker queue not specified or not allowed" },
          { status: 400 },
        )
      }

      workerReport = await executeWorker(queue as JobQueueName)
    }

    return NextResponse.json({
      ok: true,
      task: taskName ? { name: taskName, jobId: taskResult?.jobId, alreadyQueued: taskResult?.jobId ? false : true } : null,
      worker: workerReport
        ? {
            queue: workerReport.queue,
            claimed: workerReport.claimed,
            succeeded: workerReport.succeeded,
            failed: workerReport.failed,
          }
        : null,
      durationMs: Date.now() - startTime,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = error instanceof JobsError ? 400 : 500

    // Log erreur cron
    if (taskName) {
      await jobQueue.markCronExecution(
        taskName,
        "failed",
        null,
        message,
        Date.now() - startTime,
      ).catch(() => {})
    }

    // Ne pas exposer les détails d'erreur internes au client
    return NextResponse.json(
      { ok: false, error: status === 400 ? "invalid request" : "internal error", task: taskName },
      { status },
    )
  }
}