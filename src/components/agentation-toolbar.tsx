'use client'

import { Agentation } from 'agentation'

/**
 * Client-side wrapper for the Agentation visual feedback toolbar.
 * Renders on all environments so it's available on the Render deploy
 * for giving UI feedback.
 *
 * When NEXT_PUBLIC_AGENTATION_ENDPOINT is set, annotations are synced
 * to the Agentation MCP server in real-time (instead of copy-only mode).
 */
export function AgentationToolbar() {
  const endpoint = process.env.NEXT_PUBLIC_AGENTATION_ENDPOINT || undefined

  return <Agentation endpoint={endpoint} />
}
