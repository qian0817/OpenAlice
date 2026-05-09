/**
 * Web outbound connector.
 *
 * As of the notifications-store refactor, this class is a near-stub. Its
 * only remaining job is to be registered with the ConnectorCenter so that
 * `lastInteraction` tracking works — `message.received` events from
 * `routes/chat.ts` cause the center to mark "web" as the active surface,
 * which other connectors (e.g. Telegram) consult before deciding whether
 * to inline a notification into their chat thread.
 *
 * Notifications themselves no longer flow through `send()`. They go to
 * `notificationsStore.append()` (via `connectorCenter.notify()`); the web
 * plugin subscribes to the store's `onAppended` event and pushes entries
 * to clients connected to `/api/notifications/stream`.
 */

import type { Connector, ConnectorCapabilities, SendPayload, SendResult } from '../types.js'

export class WebConnector implements Connector {
  readonly channel = 'web'
  /**
   * `to` used to mean "the chat session this connector writes to" and was
   * hard-coded to 'default'. It no longer carries that meaning — it's
   * retained as a placeholder identifier so the Connector contract stays
   * stable. Single-tenant, so no real per-user disambiguation needed.
   */
  readonly to = 'web'
  readonly capabilities: ConnectorCapabilities = { push: true, media: true }

  async send(_payload: SendPayload): Promise<SendResult> {
    // Loud no-op: nothing in the codebase should be calling this anymore.
    // Previously this was the path heartbeat/cron used; notifications now
    // go through notificationsStore + onAppended instead.
    console.warn(
      'WebConnector.send() invoked — this path is deprecated; notifications flow through notificationsStore.onAppended',
    )
    return { delivered: false }
  }
}
