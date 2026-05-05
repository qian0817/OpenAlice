import { useState, useEffect, useRef, useCallback } from 'react'
import { chatApi } from '../api/chat'
import type { ChatStreamEvent } from '../api/chat'
import type { ToolCall, StreamingToolCall, ChatHistoryItem } from '../api/types'

// ==================== Types ====================

export type DisplayItem =
  | { kind: 'text'; role: 'user' | 'assistant' | 'notification'; text: string; timestamp?: string | null; media?: Array<{ type: string; url: string }>; _id: number; cursor?: string }
  | { kind: 'tool_calls'; calls: ToolCall[]; timestamp?: string; _id: number; cursor?: string }

export type StreamSegment =
  | { kind: 'text'; text: string }
  | { kind: 'tools'; tools: StreamingToolCall[] }

// ==================== Pure reducers ====================

type StreamEventPayload = Extract<ChatStreamEvent, { type: 'stream' }>['event']

export function reduceStreamEvent(segments: StreamSegment[], ev: StreamEventPayload): StreamSegment[] {
  const next = segments.map((s): StreamSegment =>
    s.kind === 'text' ? { ...s } : { ...s, tools: [...s.tools] },
  )

  if (ev.type === 'tool_use') {
    const last = next[next.length - 1]
    if (last?.kind === 'tools') {
      last.tools.push({ id: ev.id, name: ev.name, input: ev.input, status: 'running' })
    } else {
      next.push({ kind: 'tools', tools: [{ id: ev.id, name: ev.name, input: ev.input, status: 'running' }] })
    }
  } else if (ev.type === 'tool_result') {
    for (const seg of next) {
      if (seg.kind === 'tools') {
        const t = seg.tools.find((tool) => tool.id === ev.tool_use_id)
        if (t) { t.status = 'done'; t.result = ev.content; break }
      }
    }
  } else if (ev.type === 'text') {
    const last = next[next.length - 1]
    if (last?.kind === 'text') {
      last.text += ev.text
    } else {
      next.push({ kind: 'text', text: ev.text })
    }
  }

  return next
}

export function finalizeMessages(
  segments: StreamSegment[],
  finalText: string,
  finalMedia: Array<{ type: string; url: string }> | undefined,
  idGen: () => number,
): DisplayItem[] {
  if (!finalText) return []
  const items: DisplayItem[] = []

  // Preserve interleaved order: emit each segment as a DisplayItem
  for (const seg of segments) {
    if (seg.kind === 'tools') {
      items.push({
        kind: 'tool_calls',
        calls: seg.tools.map((t) => ({
          name: t.name,
          input: typeof t.input === 'string' ? t.input : JSON.stringify(t.input ?? ''),
          result: t.result,
        })),
        _id: idGen(),
      })
    } else {
      items.push({ kind: 'text', role: 'assistant', text: seg.text, _id: idGen() })
    }
  }

  // Final text from the done event (the complete response)
  // If the last segment was already a text block, replace it with finalText + media
  // (the done event's text is the authoritative final version)
  const lastItem = items[items.length - 1]
  if (lastItem?.kind === 'text' && lastItem.role === 'assistant') {
    lastItem.text = finalText
    lastItem.media = finalMedia
  } else {
    items.push({ kind: 'text', role: 'assistant', text: finalText, media: finalMedia, _id: idGen() })
  }

  return items
}

// ==================== Hook ====================

interface UseChatOptions {
  channel: string
}

export interface UseChatReturn {
  messages: DisplayItem[]
  streamSegments: StreamSegment[]
  isWaiting: boolean
  /**
   * True when the streaming POST died mid-flight and we're polling history
   * to pick up the assistant reply once the backend finishes generating.
   * UI should keep input locked (just like during isWaiting). Surfaced
   * separately so callers can show a "reconnecting…" indicator.
   */
  awaitingResume: boolean
  send: (text: string) => Promise<void>
  abort: () => void
  /** Fetch the next older page of history. No-op while in flight or when no more to load. */
  loadMore: () => Promise<void>
  hasMore: boolean
  isLoadingMore: boolean
}

const INITIAL_PAGE_SIZE = 50
const PAGE_SIZE = 50

/**
 * Resume polling — when a chat send loses its connection mid-stream, the
 * agent keeps generating server-side and writes the result into the session
 * log. We poll history every RESUME_POLL_MS until that assistant reply
 * shows up, then merge it back in.
 */
const RESUME_POLL_MS = 2_000
/** After this much time without seeing the reply, give up and show an error. */
const RESUME_TIMEOUT_MS = 60_000

export function useChat({ channel }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<DisplayItem[]>([])
  const [streamSegments, setStreamSegments] = useState<StreamSegment[]>([])
  const [isWaiting, setIsWaiting] = useState(false)
  const [awaitingResume, setAwaitingResume] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  /** Aborts the resume-polling loop — cancelled on next send / unmount. */
  const resumeAbortRef = useRef<AbortController | null>(null)
  const nextId = useRef(0)
  const channelRef = useRef(channel)
  channelRef.current = channel

  // Refs so loadMore stays referentially stable (ChatPage attaches a
  // scroll listener in a useEffect with [] deps and captures this once).
  const messagesRef = useRef<DisplayItem[]>([])
  messagesRef.current = messages
  const hasMoreRef = useRef(false)
  hasMoreRef.current = hasMore
  const isLoadingMoreRef = useRef(false)

  const toDisplayItem = useCallback((m: ChatHistoryItem): DisplayItem => {
    if (m.kind === 'text' && m.metadata?.kind === 'notification') {
      return { ...m, role: 'notification', _id: nextId.current++ }
    }
    return { ...m, _id: nextId.current++ }
  }, [])

  // Load chat history when channel changes
  useEffect(() => {
    const ch = channel === 'default' ? undefined : channel
    // Reset pagination on channel switch.
    setMessages([])
    setHasMore(false)
    isLoadingMoreRef.current = false
    chatApi.history(INITIAL_PAGE_SIZE, ch).then(({ messages: msgs, hasMore: more }) => {
      setMessages(msgs.map(toDisplayItem))
      setHasMore(more)
    }).catch((err) => {
      console.warn('Failed to load history:', err)
    })
  }, [channel, toDisplayItem])

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return
    const oldestCursor = messagesRef.current[0]?.cursor
    if (!oldestCursor) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const ch = channelRef.current === 'default' ? undefined : channelRef.current
      const { messages: older, hasMore: more } = await chatApi.history(PAGE_SIZE, ch, oldestCursor)
      if (older.length > 0) {
        setMessages((prev) => [...older.map(toDisplayItem), ...prev])
      }
      setHasMore(more)
    } catch (err) {
      console.warn('Failed to load older messages:', err)
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [toDisplayItem])

  // Cleanup on unmount: abort any in-flight stream and resume poll.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      resumeAbortRef.current?.abort()
    }
  }, [])

  /**
   * Run the resume-polling loop until either we see the assistant reply
   * land in history (then merge and unlock) or we hit the timeout (give up
   * and show an error notification). Cancellable via resumeAbortRef.
   */
  const startResumePolling = useCallback(() => {
    const ctrl = new AbortController()
    resumeAbortRef.current = ctrl
    const startTs = Date.now()

    const sleep = (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
        const t = setTimeout(resolve, ms)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('aborted', 'AbortError'))
        }, { once: true })
      })

    const loop = async () => {
      while (!ctrl.signal.aborted) {
        try {
          await sleep(RESUME_POLL_MS, ctrl.signal)
        } catch { return }

        try {
          const ch = channelRef.current === 'default' ? undefined : channelRef.current
          const { messages: server } = await chatApi.history(20, ch)
          if (ctrl.signal.aborted) return

          // Find what's new past our latest authoritative (cursored) item.
          // Anything optimistic (no cursor) gets dropped — server's version wins.
          const local = messagesRef.current
          const latestLocalCursor = [...local].reverse().find((m) => m.cursor != null)?.cursor ?? null
          let newItems = server
          if (latestLocalCursor) {
            const idx = server.findIndex((m) => m.cursor === latestLocalCursor)
            if (idx >= 0) newItems = server.slice(idx + 1)
          }
          const sawAssistant = newItems.some((m) => m.kind === 'text' && m.role === 'assistant')
          if (sawAssistant) {
            setMessages((prev) => {
              const cursored = prev.filter((m) => m.cursor != null)
              return [...cursored, ...newItems.map(toDisplayItem)]
            })
            setAwaitingResume(false)
            setIsWaiting(false)
            resumeAbortRef.current = null
            return
          }
        } catch {
          // Network still flaky — keep polling until timeout.
        }

        if (Date.now() - startTs > RESUME_TIMEOUT_MS) {
          setMessages((prev) => [
            ...prev,
            {
              kind: 'text',
              role: 'notification',
              text: 'Connection lost mid-stream and the assistant reply has not landed within 60s. The agent may still be running — refresh to check.',
              _id: nextId.current++,
            },
          ])
          setAwaitingResume(false)
          setIsWaiting(false)
          resumeAbortRef.current = null
          return
        }
      }
    }

    void loop()
  }, [toDisplayItem])

  const send = useCallback(async (text: string) => {
    // A fresh send pre-empts any in-flight resume polling.
    resumeAbortRef.current?.abort()
    resumeAbortRef.current = null
    setAwaitingResume(false)

    setStreamSegments([])
    setMessages((prev) => [...prev, { kind: 'text', role: 'user', text, _id: nextId.current++ }])
    setIsWaiting(true)

    const abort = new AbortController()
    abortRef.current = abort

    let userAborted = false
    let sawDone = false
    let segments: StreamSegment[] = []
    let finalText = ''
    let finalMedia: Array<{ type: string; url: string }> | undefined

    try {
      const ch = channelRef.current === 'default' ? undefined : channelRef.current
      for await (const event of chatApi.sendStreaming(text, ch, abort.signal)) {
        if (event.type === 'stream') {
          segments = reduceStreamEvent(segments, event.event)
          setStreamSegments(segments)
        } else if (event.type === 'done') {
          sawDone = true
          finalText = event.text
          finalMedia = event.media?.length ? event.media : undefined
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        userAborted = true
      }
      // Other errors: stream got cut; fall through to resume logic below.
    } finally {
      abortRef.current = null
    }

    if (userAborted) {
      // User gave up — clear streaming state, leave optimistic message.
      setStreamSegments([])
      setIsWaiting(false)
      return
    }

    if (sawDone) {
      // Happy path.
      setStreamSegments([])
      const newItems = finalizeMessages(segments, finalText, finalMedia, () => nextId.current++)
      if (newItems.length > 0) {
        setMessages((prev) => [...prev, ...newItems])
      }
      setIsWaiting(false)
      return
    }

    // Stream ended without a `done` event — connection died mid-flight.
    // Backend is still generating; the result will land in the session log.
    // Lock the UI and start polling history until we see the reply.
    setStreamSegments([])
    setAwaitingResume(true)
    startResumePolling()
  }, [startResumePolling])

  const abortFn = useCallback(() => { abortRef.current?.abort() }, [])

  return { messages, streamSegments, isWaiting, awaitingResume, send, abort: abortFn, loadMore, hasMore, isLoadingMore }
}
