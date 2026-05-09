import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createNotificationsStore,
  createMemoryNotificationsStore,
  type INotificationsStore,
  type NotificationEntry,
} from './notifications-store.js'

describe('NotificationsStore (in-memory)', () => {
  let store: INotificationsStore

  beforeEach(() => {
    store = createMemoryNotificationsStore()
  })

  it('append assigns id + ts and returns the entry', async () => {
    const before = Date.now()
    const entry = await store.append({ text: 'hello', source: 'heartbeat' })
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(entry.text).toBe('hello')
    expect(entry.source).toBe('heartbeat')
    expect(entry.ts).toBeGreaterThanOrEqual(before)
  })

  it('read with default limit returns entries newest-first', async () => {
    await store.append({ text: 'first' })
    await store.append({ text: 'second' })
    await store.append({ text: 'third' })
    const { entries, hasMore } = await store.read()
    expect(entries.map((e) => e.text)).toEqual(['third', 'second', 'first'])
    expect(hasMore).toBe(false)
  })

  it('read respects limit and reports hasMore', async () => {
    for (let i = 0; i < 5; i++) await store.append({ text: `n${i}` })
    const { entries, hasMore } = await store.read({ limit: 3 })
    expect(entries.map((e) => e.text)).toEqual(['n4', 'n3', 'n2'])
    expect(hasMore).toBe(true)
  })

  it('read filters by source', async () => {
    await store.append({ text: 'h1', source: 'heartbeat' })
    await store.append({ text: 'c1', source: 'cron' })
    await store.append({ text: 'h2', source: 'heartbeat' })
    const { entries } = await store.read({ source: 'heartbeat' })
    expect(entries.map((e) => e.text)).toEqual(['h2', 'h1'])
  })

  it('read uses `before` cursor to paginate older', async () => {
    const e1 = await store.append({ text: 'first' })
    const e2 = await store.append({ text: 'second' })
    const e3 = await store.append({ text: 'third' })
    const { entries } = await store.read({ before: e3.id, limit: 100 })
    // Only entries appearing before e3 (older), newest-first.
    expect(entries.map((e) => e.id)).toEqual([e2.id, e1.id])
  })

  it('onAppended fires on append, dispose stops further notifications', async () => {
    const seen: NotificationEntry[] = []
    const dispose = store.onAppended((e) => seen.push(e))
    await store.append({ text: 'a' })
    await store.append({ text: 'b' })
    expect(seen).toHaveLength(2)
    dispose()
    await store.append({ text: 'c' })
    expect(seen).toHaveLength(2)
  })

  it('multiple subscribers all receive events', async () => {
    const a: string[] = []
    const b: string[] = []
    store.onAppended((e) => a.push(e.text))
    store.onAppended((e) => b.push(e.text))
    await store.append({ text: 'x' })
    expect(a).toEqual(['x'])
    expect(b).toEqual(['x'])
  })
})

describe('NotificationsStore (JSONL persistence)', () => {
  let dir: string
  let path: string
  let store: INotificationsStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'oa-notif-'))
    path = join(dir, 'notifications.jsonl')
    store = createNotificationsStore({ filePath: path })
  })

  it('persists across new store instances on the same file', async () => {
    await store.append({ text: 'persisted', source: 'cron' })
    // Drop the in-memory state by creating a fresh instance over the same file.
    const fresh = createNotificationsStore({ filePath: path })
    const { entries } = await fresh.read()
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('persisted')
    expect(entries[0].source).toBe('cron')
    await rm(dir, { recursive: true, force: true })
  })

  it('returns empty when file does not exist', async () => {
    const missing = createNotificationsStore({ filePath: join(dir, 'absent.jsonl') })
    const { entries, hasMore } = await missing.read()
    expect(entries).toEqual([])
    expect(hasMore).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })
})
