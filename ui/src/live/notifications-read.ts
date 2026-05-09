import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { notificationsLive } from './notifications'

interface NotificationsReadState {
  /** Wall-clock ms of the latest notification the user has seen. Older = read. */
  lastSeenTs: number
}

interface NotificationsReadActions {
  /**
   * Mark every entry newer than the latest live entry as read. No-op when
   * the live store hasn't loaded yet (loading=true) or has no entries.
   */
  markAllRead: () => void
}

/**
 * Tracks "what's the most recent notification timestamp the user has
 * acknowledged." Combined with the live store's `entries`, this gives us
 * an unread count without persisting per-entry read state.
 *
 * Persisted to localStorage so unread state survives reloads — otherwise
 * every page refresh would re-flag everything as new.
 */
export const useNotificationsRead = create<NotificationsReadState & NotificationsReadActions>()(
  persist(
    (set) => ({
      lastSeenTs: 0,
      markAllRead: () => {
        const { entries } = notificationsLive.getState()
        if (entries.length === 0) return
        const latest = entries[0].ts
        set((s) => (s.lastSeenTs >= latest ? s : { lastSeenTs: latest }))
      },
    }),
    { name: 'openalice.notifications-read.v1', version: 1 },
  ),
)

/** Selector helper: derive unread count from live entries + last-seen ts. */
export function useUnreadNotificationsCount(): number {
  const lastSeen = useNotificationsRead((s) => s.lastSeenTs)
  return notificationsLive.useStore((s) =>
    s.entries.reduce((n, e) => (e.ts > lastSeen ? n + 1 : n), 0),
  )
}
