import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createExecutor } from '@/lib/services/executor'

export async function GET() {
  const configs = await prisma.executorConfig.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(configs)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type, isDefault, configJson } = body

  if (!name || !type) {
    return NextResponse.json(
      { error: 'name and type are required' },
      { status: 400 }
    )
  }

  const validTypes = ['claude-cli', 'mock']
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  // Health check the executor
  const executor = createExecutor(type)
  const health = await executor.healthCheck()

  // If setting as default, unset other defaults
  if (isDefault) {
    await prisma.executorConfig.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    })
  }

  try {
    const config = await prisma.executorConfig.create({
      data: {
        name,
        type,
        isDefault: isDefault || false,
        configJson: configJson ? JSON.stringify(configJson) : '{}',
        lastHealthCheck: health.ok ? new Date() : null,
      },
    })

    return NextResponse.json({ ...config, health }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: `Executor "${name}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
