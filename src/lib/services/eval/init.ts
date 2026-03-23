/**
 * Auto-initialize eval handlers on first import.
 * This module is imported by API routes that need eval execution.
 */

import { registerEvalHandlers } from './register-handlers'

let initialized = false

export function ensureEvalHandlersRegistered(): void {
  if (initialized) return
  initialized = true
  registerEvalHandlers()
}
