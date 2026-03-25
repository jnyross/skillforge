'use client'

import { Agentation } from 'agentation'

/**
 * Client-side wrapper for the Agentation visual feedback toolbar.
 * Renders on all environments so it's available on the Render deploy
 * for giving UI feedback.
 */
export function AgentationToolbar() {
  return <Agentation />
}
