import { prisma } from '@/lib/prisma'

/**
 * Write an audit log entry. All significant actions are logged for traceability.
 */
export async function logAuditEvent(params: {
  action: string
  entityType?: string
  entityId?: string
  actor?: string
  details?: Record<string, unknown>
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType ?? '',
      entityId: params.entityId ?? '',
      actor: params.actor ?? 'user',
      details: JSON.stringify(params.details ?? {}),
    },
  })
}
