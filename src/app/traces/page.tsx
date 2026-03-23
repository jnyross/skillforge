'use client'

import { Activity } from 'lucide-react'

export default function TracesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6" />
          Trace Lab
        </h1>
        <p className="text-muted-foreground mt-1">
          Browse and analyze execution traces, failure clusters, and tool call timelines
        </p>
      </div>

      <div className="border border-dashed border-border rounded-lg p-12 text-center">
        <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No traces yet</h3>
        <p className="text-muted-foreground mb-4">
          Run eval suites to generate execution traces. Traces capture tool calls,
          artifacts, timings, and outputs for every Claude Code execution.
        </p>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Features: trace browser, artifact viewer, failure clustering,</p>
          <p>promote trace to regression test, side-by-side comparison</p>
        </div>
      </div>
    </div>
  )
}
