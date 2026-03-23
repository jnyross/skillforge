import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/optimizer-runs/:id/lineage — Returns tree structure of optimizer candidates
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const run = await prisma.optimizerRun.findUnique({
    where: { id },
    include: {
      candidates: {
        include: {
          parentVersion: {
            select: { id: true, commitMessage: true, isChampion: true },
          },
          candidateVersion: {
            select: { id: true, commitMessage: true, isChampion: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Optimizer run not found' }, { status: 404 })
  }

  // Build tree nodes
  interface LineageNode {
    id: string
    versionId: string | null
    label: string
    status: string
    mutationType: string
    parentId: string | null
    children: LineageNode[]
  }

  const nodes: LineageNode[] = []
  const nodeMap = new Map<string, LineageNode>()

  // Root node is the baseline version
  const rootNode: LineageNode = {
    id: 'baseline',
    versionId: run.baselineVersionId,
    label: 'Baseline',
    status: 'baseline',
    mutationType: '',
    parentId: null,
    children: [],
  }
  nodes.push(rootNode)
  nodeMap.set(run.baselineVersionId, rootNode)

  // Add candidate nodes
  for (const candidate of run.candidates) {
    const node: LineageNode = {
      id: candidate.id,
      versionId: candidate.candidateVersionId,
      label: candidate.candidateVersion?.commitMessage || candidate.mutationType,
      status: candidate.status,
      mutationType: candidate.mutationType,
      parentId: candidate.parentVersionId,
      children: [],
    }

    // Find parent node and attach
    const parentNode = nodeMap.get(candidate.parentVersionId)
    if (parentNode) {
      parentNode.children.push(node)
    } else {
      // Orphan — attach to root
      rootNode.children.push(node)
    }

    if (candidate.candidateVersionId) {
      nodeMap.set(candidate.candidateVersionId, node)
    }
  }

  return NextResponse.json({
    runId: run.id,
    baselineVersionId: run.baselineVersionId,
    tree: rootNode,
    totalCandidates: run.candidates.length,
    kept: run.candidates.filter(c => c.status === 'keep').length,
    discarded: run.candidates.filter(c => c.status === 'discard').length,
    crashed: run.candidates.filter(c => c.status === 'crash').length,
  })
}
