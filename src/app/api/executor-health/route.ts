import { NextResponse } from 'next/server'
import { createExecutor } from '@/lib/services/executor'

/**
 * Health check endpoint for executors.
 * Returns the availability status of each executor type.
 */
export async function GET() {
  const results: Record<string, { ok: boolean; version?: string; error?: string }> = {}

  for (const type of ['claude-cli', 'mock'] as const) {
    try {
      const executor = createExecutor(type)
      results[type] = await executor.healthCheck()
    } catch (err) {
      results[type] = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return NextResponse.json(results)
}
