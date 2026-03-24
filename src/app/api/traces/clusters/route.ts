import { NextRequest, NextResponse } from 'next/server'
import { getFailureClusters } from '@/lib/services/trace/trace-clustering'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const skillRepoId = searchParams.get('skillRepoId') || undefined
  const suiteId = searchParams.get('suiteId') || undefined
  const evalRunId = searchParams.get('evalRunId') || undefined

  const clusters = await getFailureClusters({ skillRepoId, suiteId, evalRunId })
  return NextResponse.json(clusters)
}
