import type { ChatHistoryItem } from './types'

export type DiaryOutcome =
  | 'delivered'
  | 'silent-ok'
  | 'duplicate'
  | 'empty'
  | 'outside-hours'
  | 'error'

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

export const diaryApi = {
  async history(opts?: { limit?: number; afterSeq?: number }): Promise<DiaryHistoryResponse> {
    const params = new URLSearchParams()
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit))
    if (opts?.afterSeq !== undefined) params.set('afterSeq', String(opts.afterSeq))
    const qs = params.toString()
    const res = await fetch(`/api/diary/history${qs ? `?${qs}` : ''}`)
    if (!res.ok) throw new Error('Failed to load diary history')
    return res.json()
  },
}
