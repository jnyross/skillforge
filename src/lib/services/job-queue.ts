import { prisma } from '@/lib/prisma'
import { v4 as uuid } from 'uuid'

/**
 * In-process job queue for dev. Same interface can be swapped for BullMQ/Redis in prod.
 * Jobs are persisted to the database via JobRecord model.
 */

export type JobType = 'eval-run' | 'calibration' | 'optimizer' | 'wizard-generate'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface JobHandler {
  (payload: Record<string, unknown>): Promise<Record<string, unknown>>
}

const handlers = new Map<JobType, JobHandler>()
let processing = false

/**
 * Register a handler for a job type.
 */
export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler)
}

/**
 * Enqueue a new job.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options?: { priority?: number; maxAttempts?: number }
): Promise<string> {
  const id = uuid()
  await prisma.jobRecord.create({
    data: {
      id,
      type,
      status: 'queued',
      payload: JSON.stringify(payload),
      priority: options?.priority ?? 0,
      maxAttempts: options?.maxAttempts ?? 3,
    },
  })

  // In dev mode, process immediately in-process (non-blocking)
  setImmediate(() => processNextJob())

  return id
}

/**
 * Cancel a queued or running job.
 */
export async function cancelJob(jobId: string): Promise<void> {
  await prisma.jobRecord.update({
    where: { id: jobId },
    data: { status: 'cancelled', completedAt: new Date() },
  })
}

/**
 * Get job status.
 */
export async function getJobStatus(jobId: string) {
  return prisma.jobRecord.findUnique({ where: { id: jobId } })
}

/**
 * Process the next queued job. In-process worker loop.
 */
async function processNextJob(): Promise<void> {
  if (processing) return
  processing = true

  try {
    const job = await prisma.jobRecord.findFirst({
      where: { status: 'queued' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })

    if (!job) {
      processing = false
      return
    }

    const handler = handlers.get(job.type as JobType)
    if (!handler) {
      await prisma.jobRecord.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: `No handler registered for job type: ${job.type}`,
          completedAt: new Date(),
        },
      })
      processing = false
      setImmediate(() => processNextJob())
      return
    }

    await prisma.jobRecord.update({
      where: { id: job.id },
      data: {
        status: 'running',
        startedAt: new Date(),
        attempts: job.attempts + 1,
      },
    })

    try {
      const payload = JSON.parse(job.payload) as Record<string, unknown>
      const result = await handler(payload)
      await prisma.jobRecord.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          result: JSON.stringify(result),
          completedAt: new Date(),
        },
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const shouldRetry = job.attempts + 1 < job.maxAttempts
      await prisma.jobRecord.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? 'queued' : 'failed',
          error: errorMsg,
          completedAt: shouldRetry ? null : new Date(),
        },
      })
    }
  } finally {
    processing = false
  }

  // Check for more jobs
  setImmediate(() => processNextJob())
}
