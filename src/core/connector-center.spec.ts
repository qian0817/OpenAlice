import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  ConnectorCenter,
  type Connector,
} from './connector-center.js'
import { createEventLog, type EventLog } from './event-log.js'
import { createListenerRegistry } from './listener-registry.js'
import { createMemoryNotificationsStore } from './notifications-store.js'

function makeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    channel: 'test',
    to: 'default',
    capabilities: { push: true, media: false },
    send: async () => ({ delivered: true }),
    ...overrides,
  }
}

describe('ConnectorCenter', () => {
  describe('without EventLog', () => {
    let cc: ConnectorCenter

    beforeEach(() => {
      cc = new ConnectorCenter({
        notificationsStore: createMemoryNotificationsStore(),
      })
    })

    describe('register', () => {
      it('should register and list connectors', () => {
        cc.register(makeConnector({ channel: 'telegram', to: '123' }))

        expect(cc.hasConnectors()).toBe(true)
        expect(cc.list()).toHaveLength(1)
        expect(cc.list()[0].channel).toBe('telegram')
      })

      it('should replace existing registration for same channel', () => {
        cc.register(makeConnector({ channel: 'telegram', to: '123' }))
        cc.register(makeConnector({ channel: 'telegram', to: '456' }))

        expect(cc.list()).toHaveLength(1)
        expect(cc.list()[0].to).toBe('456')
      })

      it('should support multiple channels', () => {
        cc.register(makeConnector({ channel: 'telegram', to: '123' }))
        cc.register(makeConnector({ channel: 'discord', to: '#general' }))

        expect(cc.list()).toHaveLength(2)
      })

      it('should return an unregister function', () => {
        const unregister = cc.register(makeConnector({ channel: 'telegram', to: '123' }))

        expect(cc.hasConnectors()).toBe(true)
        unregister()
        expect(cc.hasConnectors()).toBe(false)
      })

      it('should expose capabilities', () => {
        cc.register(makeConnector({
          channel: 'telegram',
          capabilities: { push: true, media: true },
        }))

        const connector = cc.list()[0]
        expect(connector.capabilities.push).toBe(true)
        expect(connector.capabilities.media).toBe(true)
      })
    })

    describe('get', () => {
      it('should return connector by channel name', () => {
        cc.register(makeConnector({ channel: 'telegram', to: '123' }))

        expect(cc.get('telegram')).not.toBeNull()
        expect(cc.get('telegram')!.channel).toBe('telegram')
      })

      it('should return null for unknown channel', () => {
        expect(cc.get('nonexistent')).toBeNull()
      })
    })

    describe('notify', () => {
      it('appends to the notifications store and returns the entry', async () => {
        const entry = await cc.notify('hello', { source: 'heartbeat' })
        expect(entry.text).toBe('hello')
        expect(entry.source).toBe('heartbeat')
        expect(entry.id).toBeDefined()
        expect(entry.ts).toBeGreaterThan(0)
      })

      it('forwards media to the store', async () => {
        const entry = await cc.notify('chart', {
          media: [{ type: 'image', path: '/tmp/screenshot.png' }],
          source: 'cron',
        })
        expect(entry.media).toHaveLength(1)
        expect(entry.media![0].path).toBe('/tmp/screenshot.png')
      })

      it('does not require any connector to be registered', async () => {
        // No connectors at all — append still works because it goes
        // straight to the store, not via any connector.
        const entry = await cc.notify('hello')
        expect(entry.text).toBe('hello')
      })

      it('throws when no notifications store was supplied', async () => {
        const ccNoStore = new ConnectorCenter()
        await expect(ccNoStore.notify('hi')).rejects.toThrow(/notificationsStore/)
      })
    })

    describe('send (direct connector)', () => {
      it('should pass structured payload to connector', async () => {
        const payloads: Array<{ text: string; kind: string }> = []
        cc.register(makeConnector({
          channel: 'web',
          send: async (payload) => { payloads.push(payload); return { delivered: true } },
        }))

        const target = cc.get('web')!
        await target.send({ kind: 'notification', text: 'hello', source: 'heartbeat' })

        expect(payloads).toHaveLength(1)
        expect(payloads[0].text).toBe('hello')
        expect(payloads[0].kind).toBe('notification')
      })
    })
  })

  describe('with EventLog (interaction tracking)', () => {
    let cc: ConnectorCenter
    let eventLog: EventLog
    let listenerRegistry: ReturnType<typeof createListenerRegistry>

    beforeEach(async () => {
      const logPath = join(tmpdir(), `cc-test-${randomUUID()}.jsonl`)
      eventLog = await createEventLog({ logPath })
      listenerRegistry = createListenerRegistry(eventLog)
      await listenerRegistry.start()
      cc = new ConnectorCenter({
        eventLog,
        listenerRegistry,
        notificationsStore: createMemoryNotificationsStore(),
      })
    })

    afterEach(async () => {
      await listenerRegistry.stop()
      await eventLog._resetForTest()
    })

    it('auto-tracks interaction from message.received event', async () => {
      await eventLog.append('message.received', {
        channel: 'telegram', to: '123', prompt: 'hello',
      })

      const last = cc.getLastInteraction()
      expect(last).not.toBeNull()
      expect(last!.channel).toBe('telegram')
      expect(last!.to).toBe('123')
    })

    it('updates on subsequent events', async () => {
      await eventLog.append('message.received', {
        channel: 'telegram', to: '123', prompt: 'hi',
      })
      await eventLog.append('message.received', {
        channel: 'web', to: 'default', prompt: 'hello',
      })

      const last = cc.getLastInteraction()
      expect(last!.channel).toBe('web')
      expect(last!.to).toBe('default')
    })

    it('ignores non-message events', async () => {
      await eventLog.append('cron.fire', {
        jobId: 'abc', jobName: 'test', payload: 'hi',
      })

      expect(cc.getLastInteraction()).toBeNull()
    })
  })
})
