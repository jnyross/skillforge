/**
 * Register eval job handlers with the in-process job queue.
 * This should be called once at app startup.
 */

import { registerJobHandler } from '../job-queue'
import { handleEvalRunJob } from './eval-runner'

let registered = false

export function registerEvalHandlers(): void {
  if (registered) return
  registered = true

  registerJobHandler('eval-run', handleEvalRunJob)
}
