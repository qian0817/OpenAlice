/**
 * Diary route — exposes the heartbeat session as a read-only status feed.
 *
 * This is the "status" surface (as opposed to the Chat "notification" surface):
 * a passive view of what Alice has been thinking across recent heartbeat cycles,
 * including silent HEARTBEAT_OK acknowledgements that never reach Chat.
 *
 * Data sources (joined by timestamp proximity):
 *   - SessionStore('heartbeat')        → full AI turns (prompt, reasoning, tool calls, reply)
 *   - EventLog heartbeat.{done,skip,error} → outcome metadata (delivered, reason, durationMs)
 *
 * Deliberately polling-only (no SSE). Heartbeat fires ~every 30min; the overhead
 * of a persistent subscription is not justified for this frequency.
 */

import { Hono } from 'hono'
import type { EngineContext } from '../../core/types.js'
import { SessionStore, toChatHistory, type ChatHistoryItem } from '../../core/session.js'
import type { EventLogEntry } from '../../core/event-log.js'
import type {
  HeartbeatDonePayload,
  HeartbeatSkipPayload,
  HeartbeatErrorPayload,
} from '../../core/agent-event.js'

// ==================== Types ====================

export type DiaryOutcome =
  | 'delivered'      // heartbeat.done, delivered=true — CHAT_YES pushed to Chat
  | 'silent-ok'      // heartbeat.done delivered=false, or skip.reason=ack — silent HEARTBEAT_OK
  | 'duplicate'      // skip.reason=duplicate — same content as recent cycle
  | 'empty'          // skip.reason=empty — AI produced no content
  | 'outside-hours'  // skip.reason=outside-active-hours — quiet-hours guard tripped
  | 'error'          // heartbeat.error — AI call threw

export interface DiaryCycle {
  seq: number
  ts: number
  outcome: DiaryOutcome
  reason?: string
  durationMs?: number
}

export interface DiaryHistoryResponse {
  items: ChatHistoryItem[]
  cycles: DiaryCycle[]
  latestSeq: number
}

// ==================== Constants ====================

const HEARTBEAT_EVENT_TYPES = ['heartbeat.done', 'heartbeat.skip', 'heartbeat.error'] as const

/** Slack when joining session entries to cycles by timestamp — covers cron.fire → session.appendUser → ... → event.append gaps. */
const INCREMENTAL_SLACK_MS = 5_000

/** Default cap on session entries returned on a full fetch. Each cycle yields ~1-3 entries. */
const FULL_FETCH_ENTRY_CAP = 400

// ==================== Module-scoped session ====================

// Reuse a single SessionStore instance across requests to avoid re-allocating
// on every poll. The JSONL file is still re-read per request via readActive().
let heartbeatSession: SessionStore | null = null

function getHeartbeatSession(): SessionStore {
  if (!heartbeatSession) {
    heartbeatSession = new SessionStore('heartbeat')
  }
  return heartbeatSession
}

// ==================== Event → cycle mapping ====================

/** Classify a heartbeat event into a user-visible outcome. */
export function outcomeFromEvent(entry: EventLogEntry): DiaryOutcome {
  if (entry.type === 'heartbeat.done') {
    return (entry.payload as HeartbeatDonePayload).delivered ? 'delivered' : 'silent-ok'
  }
  if (entry.type === 'heartbeat.skip') {
    const reason = (entry.payload as HeartbeatSkipPayload).reason
    switch (reason) {
      case 'ack': return 'silent-ok'
      case 'duplicate': return 'duplicate'
      case 'empty': return 'empty'
      case 'outside-active-hours': return 'outside-hours'
      default: return 'silent-ok'
    }
  }
  if (entry.type === 'heartbeat.error') return 'error'
  return 'silent-ok'
}

/** Project event-log entries into display cycles. */
export function buildDiaryCycles(events: EventLogEntry[]): DiaryCycle[] {
  return events.map((e) => {
    const outcome = outcomeFromEvent(e)
    let reason: string | undefined
    let durationMs: number | undefined

    if (e.type === 'heartbeat.done') {
      const p = e.payload as HeartbeatDonePayload
      reason = p.reason || undefined
      durationMs = p.durationMs
    } else if (e.type === 'heartbeat.skip') {
      const p = e.payload as HeartbeatSkipPayload
      // parsedReason is the AI's own wording; prefer it over the machine-facing reason code.
      reason = p.parsedReason ?? p.reason
    } else if (e.type === 'heartbeat.error') {
      const p = e.payload as HeartbeatErrorPayload
      reason = p.error
      durationMs = p.durationMs
    }

    return { seq: e.seq, ts: e.ts, outcome, reason, durationMs }
  })
}

// ==================== Route factory ====================

export function createDiaryRoutes(ctx: EngineContext) {
  const app = new Hono()

  /**
   * GET /history?limit=100&afterSeq=123
   *
   * - afterSeq omitted (or 0): full fetch — last `limit` cycles + recent session items.
   * - afterSeq > 0: incremental — only cycles with seq > afterSeq and session items
   *   timestamped after the oldest new cycle (minus slack for prompt-before-reply gap).
   */
  app.get('/history', async (c) => {
    const limit = clamp(Number(c.req.query('limit')) || 100, 1, 500)
    const afterSeq = Math.max(0, Number(c.req.query('afterSeq')) || 0)

    // Read from disk, not the in-memory ring buffer.
    // The ring buffer (~500 entries) gets saturated by high-frequency events
    // (snapshot.skipped, account.health), evicting older heartbeat entries —
    // the activity we care about here fires only ~every 30min.
    // One disk scan with in-memory type filtering is cheaper than three.
    const allEvents = await ctx.eventLog.read({ afterSeq })
    const eventTypes = new Set<string>(HEARTBEAT_EVENT_TYPES)
    const events = allEvents.filter((e) => eventTypes.has(e.type))
    const cycles = buildDiaryCycles(events).slice(-limit)

    // Read heartbeat session entries.
    const session = getHeartbeatSession()
    const entries = await session.readActive()

    let items: ChatHistoryItem[]
    if (afterSeq > 0) {
      if (cycles.length === 0) {
        items = []
      } else {
        const cutoff = cycles[0].ts - INCREMENTAL_SLACK_MS
        const sliced = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff)
        items = toChatHistory(sliced)
      }
    } else {
      const capped = entries.slice(-Math.max(FULL_FETCH_ENTRY_CAP, limit * 4))
      items = toChatHistory(capped)
    }

    const response: DiaryHistoryResponse = {
      items,
      cycles,
      latestSeq: ctx.eventLog.lastSeq(),
    }
    return c.json(response)
  })

  return app
}

// ==================== Helpers ====================

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
