import { api } from '../api'
import type { NotificationEntry } from '../api/notifications'
import { createLiveStore } from './createLiveStore'

/**
 * Live notifications feed. 20-second polling against
 * `/api/notifications/history` — notifications aren't time-critical
 * and the SSE socket overhead (server kept open per browser tab,
 * background-throttle quirks) wasn't worth it for a passive feed.
 *
 * The single shared connection guarantee comes from LiveStore's
 * refcount: only one polling timer regardless of subscriber count.
 */

export interface NotificationsState {
  entries: NotificationEntry[]
  /** True until the initial history fetch resolves. UI shows a skeleton. */
  loading: boolean
}

const POLL_INTERVAL_MS = 20_000

export const notificationsLive = createLiveStore<NotificationsState>({
  name: 'notifications',
  initialState: { entries: [], loading: true },
  subscribe: ({ apply }) => {
    let disposed = false

    async function refresh() {
      try {
        const { entries } = await api.notifications.history({ limit: 100 })
        if (disposed) return
        apply((prev) => ({ ...prev, entries, loading: false }))
      } catch {
        if (disposed) return
        // Surface as not-loading; next tick will retry.
        apply((prev) => ({ ...prev, loading: false }))
      }
    }

    void refresh()
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      disposed = true
      clearInterval(intervalId)
    }
  },
})
