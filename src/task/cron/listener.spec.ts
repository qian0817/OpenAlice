import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createEventLog, type EventLog } from '../../core/event-log.js'
import { createListenerRegistry, type ListenerRegistry } from '../../core/listener-registry.js'
import { createCronListener, type CronListener } from './listener.js'
import { SessionStore } from '../../core/session.js'
import type { CronFirePayload } from './engine.js'
import { ConnectorCenter } from '../../core/connector-center.js'
import { createMemoryNotificationsStore } from '../../core/notifications-store.js'

function tempPath(ext: string): string {
  return join(tmpdir(), `cron-listener-test-${randomUUID()}.${ext}`)
}

// ==================== Mock Engine ====================

function createMockEngine(response = 'AI reply') {
  const calls: Array<{ prompt: string; session: SessionStore }> = []
  let shouldFail = false

  return {
    calls,
    setResponse(text: string) { response = text },
    setShouldFail(val: boolean) { shouldFail = val },
    // Partial Engine mock — only askWithSession is needed
    askWithSession: vi.fn(async (prompt: string, session: SessionStore) => {
      calls.push({ prompt, session })
      if (shouldFail) throw new Error('engine error')
      return { text: response, media: [] }
    }),
    // Stubs for other Engine methods
    ask: vi.fn(),
  }
}

describe('cron listener', () => {
  let eventLog: EventLog
  let registry: ListenerRegistry
  let cronListener: CronListener
  let mockEngine: ReturnType<typeof createMockEngine>
  let session: SessionStore
  let logPath: string
  let connectorCenter: ConnectorCenter
  let notificationsStore: ReturnType<typeof createMemoryNotificationsStore>

  beforeEach(async () => {
    logPath = tempPath('jsonl')
    eventLog = await createEventLog({ logPath })
    registry = createListenerRegistry(eventLog)
    mockEngine = createMockEngine()
    session = new SessionStore(`test/cron-${randomUUID()}`)
    notificationsStore = createMemoryNotificationsStore()
    connectorCenter = new ConnectorCenter({ notificationsStore })

    cronListener = createCronListener({
      connectorCenter,
      agentCenter: mockEngine as any,
      registry,
      session,
    })
    await cronListener.start()
    await registry.start()
  })

  afterEach(async () => {
    await registry.stop()
    await eventLog._resetForTest()
  })

  // ==================== Basic functionality ====================

  describe('event handling', () => {
    it('should call engine.askWithSession on cron.fire', async () => {
      await eventLog.append('cron.fire', {
        jobId: 'abc12345',
        jobName: 'test-job',
        payload: 'Check the market',
      } satisfies CronFirePayload)

      // Wait for async handler
      await vi.waitFor(() => {
        expect(mockEngine.askWithSession).toHaveBeenCalledTimes(1)
      })

      expect(mockEngine.askWithSession).toHaveBeenCalledWith(
        'Check the market',
        session,
        expect.objectContaining({ historyPreamble: expect.any(String) }),
      )
    })

    it('should write cron.done event on success', async () => {
      const fireEntry = await eventLog.append('cron.fire', {
        jobId: 'abc12345',
        jobName: 'test-job',
        payload: 'Do something',
      } satisfies CronFirePayload)

      await vi.waitFor(() => {
        const done = eventLog.recent({ type: 'cron.done' })
        expect(done).toHaveLength(1)
      })

      const done = eventLog.recent({ type: 'cron.done' })
      expect(done[0].payload).toMatchObject({
        jobId: 'abc12345',
        jobName: 'test-job',
        reply: 'AI reply',
      })
      expect((done[0].payload as any).durationMs).toBeGreaterThanOrEqual(0)
      expect(done[0].causedBy).toBe(fireEntry.seq)
    })

    it('should not react to other event types', async () => {
      await eventLog.append('some.other.event', { data: 'hello' })

      // Give it a moment
      await new Promise((r) => setTimeout(r, 50))

      expect(mockEngine.askWithSession).not.toHaveBeenCalled()
    })
  })

  // ==================== Delivery ====================

  describe('delivery', () => {
    it('should append AI reply to the notifications store', async () => {
      const delivered: string[] = []
      notificationsStore.onAppended((entry) => { delivered.push(entry.text) })

      await eventLog.append('cron.fire', {
        jobId: 'abc12345',
        jobName: 'test-job',
        payload: 'Hello',
      } satisfies CronFirePayload)

      await vi.waitFor(() => {
        expect(delivered).toHaveLength(1)
      })

      expect(delivered[0]).toBe('AI reply')

      const { entries } = await notificationsStore.read()
      expect(entries[0].source).toBe('cron')
    })

    it('should handle notify failure gracefully', async () => {
      // Force the underlying append to throw — cron listener must keep
      // the loop alive (still emit cron.done).
      notificationsStore.append = async () => { throw new Error('store failed') }

      await eventLog.append('cron.fire', {
        jobId: 'abc12345',
        jobName: 'test-job',
        payload: 'Hello',
      } satisfies CronFirePayload)

      await vi.waitFor(() => {
        const done = eventLog.recent({ type: 'cron.done' })
        expect(done).toHaveLength(1)
      })
    })
  })

  // ==================== Error handling ====================

  describe('error handling', () => {
    it('should write cron.error on engine failure', async () => {
      mockEngine.setShouldFail(true)

      const fireEntry = await eventLog.append('cron.fire', {
        jobId: 'abc12345',
        jobName: 'test-job',
        payload: 'Will fail',
      } satisfies CronFirePayload)

      await vi.waitFor(() => {
        const errors = eventLog.recent({ type: 'cron.error' })
        expect(errors).toHaveLength(1)
      })

      const errors = eventLog.recent({ type: 'cron.error' })
      expect(errors[0].payload).toMatchObject({
        jobId: 'abc12345',
        jobName: 'test-job',
        error: 'engine error',
      })
      expect((errors[0].payload as any).durationMs).toBeGreaterThanOrEqual(0)
      expect(errors[0].causedBy).toBe(fireEntry.seq)
    })
  })

  // ==================== Lifecycle ====================

  describe('lifecycle', () => {
    it('should stop receiving events after registry.stop()', async () => {
      await registry.stop()

      await eventLog.append('cron.fire', {
        jobId: 'abc12345',
        jobName: 'test-job',
        payload: 'Should not fire',
      } satisfies CronFirePayload)

      // Give it a moment
      await new Promise((r) => setTimeout(r, 50))

      expect(mockEngine.askWithSession).not.toHaveBeenCalled()
    })

    it('should be idempotent on repeated start()', async () => {
      await cronListener.start()  // second call — should be a no-op
      // No error
    })
  })
})
