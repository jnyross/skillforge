/**
 * Execution mode definitions for Claude Code skill execution.
 * 
 * Three modes control what the executor is allowed to do:
 * - read-only: Can only read files & environment, no writes or side effects
 * - edit: Can read and write files, but no external side effects (no network, no exec)
 * - side-effect: Full access — can run commands, make network calls, modify filesystem
 */

export type ExecutionMode = 'read-only' | 'edit' | 'side-effect'

export interface ExecutionModeConfig {
  mode: ExecutionMode
  label: string
  description: string
  allowedOperations: string[]
  blockedOperations: string[]
  cliFlags: string[]
}

export const EXECUTION_MODES: Record<ExecutionMode, ExecutionModeConfig> = {
  'read-only': {
    mode: 'read-only',
    label: 'Read Only',
    description: 'Can only read files and environment. No writes or side effects.',
    allowedOperations: ['read_file', 'list_directory', 'search', 'grep'],
    blockedOperations: ['write_file', 'execute_command', 'http_request', 'delete_file'],
    cliFlags: ['--permission-mode', 'read-only'],
  },
  'edit': {
    mode: 'edit',
    label: 'Edit',
    description: 'Can read and write files. No external side effects (network, exec).',
    allowedOperations: ['read_file', 'write_file', 'list_directory', 'search', 'grep', 'create_file', 'delete_file'],
    blockedOperations: ['execute_command', 'http_request'],
    cliFlags: ['--permission-mode', 'edit'],
  },
  'side-effect': {
    mode: 'side-effect',
    label: 'Full Access',
    description: 'Full access — can run commands, make network calls, modify filesystem.',
    allowedOperations: ['read_file', 'write_file', 'execute_command', 'http_request', 'list_directory', 'search', 'grep', 'create_file', 'delete_file'],
    blockedOperations: [],
    cliFlags: ['--permission-mode', 'full'],
  },
}

/**
 * Validate that an execution mode is valid
 */
export function isValidExecutionMode(mode: string): mode is ExecutionMode {
  return mode in EXECUTION_MODES
}

/**
 * Get CLI flags for a given execution mode
 */
export function getExecutionModeFlags(mode: ExecutionMode): string[] {
  return EXECUTION_MODES[mode]?.cliFlags ?? []
}

/**
 * Check if an operation is allowed under a given execution mode
 */
export function isOperationAllowed(mode: ExecutionMode, operation: string): boolean {
  const config = EXECUTION_MODES[mode]
  if (!config) return false
  if (config.blockedOperations.includes(operation)) return false
  return config.allowedOperations.includes(operation) || config.allowedOperations.length === 0
}
