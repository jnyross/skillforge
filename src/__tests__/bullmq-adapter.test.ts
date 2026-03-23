/**
 * Unit tests for BullMQ adapter (memory fallback).
 */
import { describe, it, expect } from 'vitest'
import { createQueueAdapter, getQueue, type QueueJob } from '../lib/queue/bullmq-adapter'

describe('Queue Adapter', () => {
  describe('createQueueAdapter', () => {
    it('should create a memory adapter by default', () => {
      const adapter = createQueueAdapter()
      expect(adapter).toBeDefined()
    })

    it('should support getStatus', async () => {
      const adapter = createQueueAdapter()
      const status = await adapter.getStatus()
      expect(status.provider).toBe('memory')
      expect(status.connected).toBe(true)
      expect(typeof status.pending).toBe('number')
    })
  })

  describe('MemoryQueueAdapter', () => {
    it('should enqueue and dequeue jobs', async () => {
      const adapter = createQueueAdapter()
      const job: QueueJob = {
        id: 'test-1',
        type: 'eval-run',
        payload: { evalRunId: 'abc123' },
      }

      await adapter.enqueue(job)
      const dequeued = await adapter.dequeue('eval-run')
      expect(dequeued).toBeDefined()
      expect(dequeued!.id).toBe('test-1')
      expect(dequeued!.payload.evalRunId).toBe('abc123')
    })

    it('should return null when dequeuing from empty queue', async () => {
      const adapter = createQueueAdapter()
      const result = await adapter.dequeue('nonexistent')
      expect(result).toBeNull()
    })

    it('should dequeue in FIFO order', async () => {
      const adapter = createQueueAdapter()

      await adapter.enqueue({ id: 'first', type: 'test', payload: { order: 1 } })
      await adapter.enqueue({ id: 'second', type: 'test', payload: { order: 2 } })
      await adapter.enqueue({ id: 'third', type: 'test', payload: { order: 3 } })

      const first = await adapter.dequeue('test')
      const second = await adapter.dequeue('test')
      const third = await adapter.dequeue('test')

      expect(first!.id).toBe('first')
      expect(second!.id).toBe('second')
      expect(third!.id).toBe('third')
    })

    it('should track pending count in status', async () => {
      const adapter = createQueueAdapter()

      await adapter.enqueue({ id: 'j1', type: 'test', payload: {} })
      await adapter.enqueue({ id: 'j2', type: 'test', payload: {} })

      const status = await adapter.getStatus()
      expect(status.pending).toBe(2)

      await adapter.dequeue('test')
      const status2 = await adapter.getStatus()
      expect(status2.pending).toBe(1)
    })

    it('should isolate different job types', async () => {
      const adapter = createQueueAdapter()

      await adapter.enqueue({ id: 'eval-1', type: 'eval-run', payload: {} })
      await adapter.enqueue({ id: 'opt-1', type: 'optimizer-run', payload: {} })

      const eval1 = await adapter.dequeue('eval-run')
      expect(eval1!.id).toBe('eval-1')

      const opt1 = await adapter.dequeue('optimizer-run')
      expect(opt1!.id).toBe('opt-1')

      // Both queues should now be empty
      expect(await adapter.dequeue('eval-run')).toBeNull()
      expect(await adapter.dequeue('optimizer-run')).toBeNull()
    })
  })

  describe('getQueue (singleton)', () => {
    it('should return the same instance', () => {
      const q1 = getQueue()
      const q2 = getQueue()
      expect(q1).toBe(q2)
    })
  })
})
