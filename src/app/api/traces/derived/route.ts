import { NextRequest, NextResponse } from 'next/server'
import { getDerivedView } from '@/lib/services/trace/trace-clustering'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') || ''
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const validViews = ['high-token-outliers', 'high-latency-outliers', 'flaky-cases', 'judge-disagrees', 'passes-but-loses-review']
  if (!validViews.includes(view)) {
    return NextResponse.json({ error: `view must be one of: ${validViews.join(', ')}` }, { status: 400 })
  }

  const result = await getDerivedView(view, limit, offset)
  return NextResponse.json(result)
}
