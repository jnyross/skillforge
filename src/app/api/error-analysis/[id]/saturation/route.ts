import { NextRequest, NextResponse } from 'next/server'
import { computeSaturation } from '@/lib/services/error-analysis/error-analysis-service'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const metrics = await computeSaturation(params.id)
  return NextResponse.json(metrics)
}
