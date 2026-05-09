import { useChannels } from '../contexts/ChannelsContext'
import { useWorkspace } from '../tabs/store'
import { getFocusedTab } from '../tabs/types'
import { useUnreadNotificationsCount } from '../live/notifications-read'
import { ChatChannelList } from './ChatChannelList'
import { SidebarRow } from './SidebarRow'

/**
 * Connects ChatChannelList to ChannelsContext + the workspace store.
 *
 * Layout: a Notifications inbox row (with an unread badge) sits at the
 * top of the chat sidebar — clicking it opens the notifications inbox
 * as a tab. The user lives in this sidebar most of the time, so the
 * red dot here is the primary "you have new system pushes" signal.
 *
 * Below: the channel list. Active channel is derived from the focused
 * chat tab; when the focused tab isn't a chat tab, no row is highlighted.
 */
export function ChatChannelListContainer() {
  const { channels, openEditDialog, deleteChannel } = useChannels()
  const focused = useWorkspace((state) => getFocusedTab(state)?.spec)
  const focusedChannelId = focused?.kind === 'chat' ? focused.params.channelId : ''
  const inboxActive = focused?.kind === 'notifications-inbox'
  const openOrFocus = useWorkspace((state) => state.openOrFocus)
  const unreadCount = useUnreadNotificationsCount()

  return (
    <div className="flex flex-col h-full">
      <div className="py-0.5">
        <SidebarRow
          label={
            <span className="flex items-center gap-2">
              <BellIcon />
              <span>Notifications</span>
            </span>
          }
          active={inboxActive}
          onClick={() => openOrFocus({ kind: 'notifications-inbox', params: {} })}
          trail={
            unreadCount > 0 ? (
              <span
                className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-[10px] font-semibold text-white tabular-nums flex items-center justify-center"
                aria-label={`${unreadCount} unread`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : undefined
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 mt-1">
        <ChatChannelList
          channels={channels}
          activeChannel={focusedChannelId}
          onSelect={(id) => openOrFocus({ kind: 'chat', params: { channelId: id } })}
          onEdit={openEditDialog}
          onDelete={deleteChannel}
        />
      </div>
    </div>
  )
}

function BellIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
