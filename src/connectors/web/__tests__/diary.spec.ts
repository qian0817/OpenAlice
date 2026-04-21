/**
 * Tests for the diary route's event-log → cycle projection.
 *
 * The HTTP endpoint itself is a thin wrapper around `buildDiaryCycles` +
 * `session.readActive()` + `toChatHistory()`. The join/filter logic that's
 * worth locking in is event-type → outcome classification and reason
 * selection.
 */

import { describe, it, expect } from 'vitest'
import {
  buildDiaryCycles,
  outcomeFromEvent,
  type DiaryOutcome,
} from '../routes/diary.js'
import type { EventLogEntry } from '../../../core/event-log.js'

// ==================== Fixtures ====================

const done = (seq: number, ts: number, delivered: boolean, reason = 'test', durationMs = 100): EventLogEntry => ({
  seq, ts, type: 'heartbeat.done',
  payload: { reply: 'hi', reason, durationMs, delivered },
})

const skip = (seq: number, ts: number, reason: string, parsedReason?: string): EventLogEntry => ({
  seq, ts, type: 'heartbeat.skip',
  payload: parsedReason !== undefined ? { reason, parsedReason } : { reason },
})

const err = (seq: number, ts: number, error: string, durationMs = 50): EventLogEntry => ({
  seq, ts, type: 'heartbeat.error',
  payload: { error, durationMs },
})

// ==================== Tests ====================

describe('outcomeFromEvent', () => {
  const cases: Array<[string, EventLogEntry, DiaryOutcome]> = [
    ['heartbeat.done delivered=true → "delivered"', done(1, 0, true), 'delivered'],
    ['heartbeat.done delivered=false → "silent-ok"', done(1, 0, false), 'silent-ok'],
    ['heartbeat.skip reason=ack → "silent-ok"', skip(1, 0, 'ack'), 'silent-ok'],
    ['heartbeat.skip reason=duplicate → "duplicate"', skip(1, 0, 'duplicate'), 'duplicate'],
    ['heartbeat.skip reason=empty → "empty"', skip(1, 0, 'empty'), 'empty'],
    ['heartbeat.skip reason=outside-active-hours → "outside-hours"', skip(1, 0, 'outside-active-hours'), 'outside-hours'],
    ['heartbeat.skip unknown reason → "silent-ok"', skip(1, 0, 'something-else'), 'silent-ok'],
    ['heartbeat.error → "error"', err(1, 0, 'boom'), 'error'],
  ]
  for (const [label, entry, expected] of cases) {
    it(label, () => expect(outcomeFromEvent(entry)).toBe(expected))
  }

  it('returns "silent-ok" for unknown event types (defensive default)', () => {
    expect(outcomeFromEvent({ seq: 1, ts: 0, type: 'some.other.event', payload: {} })).toBe('silent-ok')
  })
})

describe('buildDiaryCycles', () => {
  it('surfaces error message as reason for heartbeat.error', () => {
    const cycles = buildDiaryCycles([err(5, 1000, 'network timeout', 250)])
    expect(cycles[0]).toMatchObject({
      seq: 5,
      ts: 1000,
      outcome: 'error',
      reason: 'network timeout',
      durationMs: 250,
    })
  })

  it('prefers parsedReason over machine reason for skip events', () => {
    // parsedReason is the AI's own wording — more useful to show humans than the machine code "ack".
    const cycles = buildDiaryCycles([skip(5, 1000, 'ack', 'market is quiet, watching for a breakout')])
    expect(cycles[0].reason).toBe('market is quiet, watching for a breakout')
  })

  it('falls back to reason when parsedReason is missing', () => {
    const cycles = buildDiaryCycles([skip(5, 1000, 'duplicate')])
    expect(cycles[0].reason).toBe('duplicate')
  })

  it('preserves input ordering (caller is responsible for sorting)', () => {
    const cycles = buildDiaryCycles([
      done(3, 3000, true),
      skip(1, 1000, 'ack'),
      err(2, 2000, 'boom'),
    ])
    expect(cycles.map((c) => c.seq)).toEqual([3, 1, 2])
  })

  it('includes durationMs for done and error, omits for skip', () => {
    const cycles = buildDiaryCycles([
      done(1, 0, true, 'x', 150),
      skip(2, 0, 'ack'),
      err(3, 0, 'oops', 42),
    ])
    expect(cycles[0].durationMs).toBe(150)
    expect(cycles[1].durationMs).toBeUndefined()
    expect(cycles[2].durationMs).toBe(42)
  })

  it('omits reason for done when the payload reason is empty', () => {
    // heartbeat.done stores its reason even on delivered cycles; an empty string
    // would render as a blank tag, which is noise.
    const cycles = buildDiaryCycles([done(1, 0, true, '', 100)])
    expect(cycles[0].reason).toBeUndefined()
  })
})
