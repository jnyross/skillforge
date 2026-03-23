/**
 * API routes for GitHub/Git remote sync.
 * 
 * GET  /api/skill-repos/:id/remote-sync — Get sync status
 * POST /api/skill-repos/:id/remote-sync — Configure remote or push/pull
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  configureRemote,
  pushToRemote,
  pullFromRemote,
  getSyncStatus,
} from '@/lib/services/git-remote-sync'
import { logAuditEvent } from '@/lib/services/audit-log'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const status = await getSyncStatus(id)
  return NextResponse.json(status)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as string

  switch (action) {
    case 'configure': {
      const remoteUrl = body.remoteUrl as string
      if (!remoteUrl) {
        return NextResponse.json({ error: 'remoteUrl is required' }, { status: 400 })
      }

      const result = await configureRemote(id, {
        remoteUrl,
        remoteName: (body.remoteName as string) || 'origin',
        authToken: body.authToken as string | undefined,
      })

      if (result.success) {
        await logAuditEvent({
          action: 'skill_repo.remote_configured',
          entityType: 'skill_repo',
          entityId: id,
          details: { remoteUrl },
        })
      }

      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    case 'push': {
      const result = await pushToRemote(
        id,
        (body.remoteName as string) || 'origin',
        (body.branch as string) || 'main'
      )

      if (result.success) {
        await logAuditEvent({
          action: 'skill_repo.remote_push',
          entityType: 'skill_repo',
          entityId: id,
          details: { commitsSynced: result.commitsSynced },
        })
      }

      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    case 'pull': {
      const result = await pullFromRemote(
        id,
        (body.remoteName as string) || 'origin',
        (body.branch as string) || 'main'
      )

      if (result.success) {
        await logAuditEvent({
          action: 'skill_repo.remote_pull',
          entityType: 'skill_repo',
          entityId: id,
          details: { commitsSynced: result.commitsSynced },
        })
      }

      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    default:
      return NextResponse.json(
        { error: 'Invalid action. Use "configure", "push", or "pull".' },
        { status: 400 }
      )
  }
}
