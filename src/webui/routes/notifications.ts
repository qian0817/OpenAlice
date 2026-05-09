/**
 * Notifications HTTP route — read history.
 *
 *   GET /history?limit=&before=&source=  paginated, newest-first
 *
 * The Web UI polls this every 20s rather than holding an SSE socket open;
 * notifications aren't time-critical and the held-connection overhead
 * (server keepalive, background-tab throttling quirks) wasn't worth it
 * for a passive feed.
 *
 * Other in-process consumers (Telegram inline-on-active, future
 * desktop OS push) subscribe to `notificationsStore.onAppended` directly
 * — no HTTP wire.
 */
import { Hono } from 'hono'
import type { INotificationsStore, NotificationSource } from '../../core/notifications-store.js'

export interface NotificationsRoutesDeps {
  notificationsStore: INotificationsStore
}

export function createNotificationsRoutes(deps: NotificationsRoutesDeps) {
  const app = new Hono()

  app.get('/history', async (c) => {
    const limit = Number(c.req.query('limit')) || 100
    const before = c.req.query('before') || undefined
    const source = c.req.query('source') as NotificationSource | undefined
    const result = await deps.notificationsStore.read({ limit, before, source })
    return c.json(result)
  })

  return app
}
