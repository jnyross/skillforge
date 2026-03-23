import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/skill-repos/:id/versions/:versionId/tags — List tags for a version
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  const version = await prisma.skillVersion.findUnique({
    where: { id: params.versionId, skillRepoId: params.id },
    include: { tags: { orderBy: { createdAt: 'asc' } } },
  })

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  return NextResponse.json(version.tags)
}

/**
 * POST /api/skill-repos/:id/versions/:versionId/tags — Add a tag to a version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  const version = await prisma.skillVersion.findUnique({
    where: { id: params.versionId, skillRepoId: params.id },
  })

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, color } = body as { name: string; color?: string }

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
  }

  if (name.length > 50) {
    return NextResponse.json({ error: 'Tag name must be 50 characters or less' }, { status: 400 })
  }

  // Check for duplicate tag
  const existing = await prisma.versionTag.findUnique({
    where: { skillVersionId_name: { skillVersionId: params.versionId, name } },
  })

  if (existing) {
    return NextResponse.json({ error: `Tag "${name}" already exists on this version` }, { status: 409 })
  }

  const tag = await prisma.versionTag.create({
    data: {
      skillVersionId: params.versionId,
      name,
      color: color || 'default',
    },
  })

  return NextResponse.json(tag, { status: 201 })
}

/**
 * DELETE /api/skill-repos/:id/versions/:versionId/tags — Remove a tag from a version
 * Expects query param: ?name=tag-name
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  const version = await prisma.skillVersion.findUnique({
    where: { id: params.versionId, skillRepoId: params.id },
  })

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  const name = request.nextUrl.searchParams.get('name')
  if (!name) {
    return NextResponse.json({ error: 'Tag name query parameter is required' }, { status: 400 })
  }

  const tag = await prisma.versionTag.findUnique({
    where: { skillVersionId_name: { skillVersionId: params.versionId, name } },
  })

  if (!tag) {
    return NextResponse.json({ error: `Tag "${name}" not found on this version` }, { status: 404 })
  }

  await prisma.versionTag.delete({ where: { id: tag.id } })

  return NextResponse.json({ success: true })
}
