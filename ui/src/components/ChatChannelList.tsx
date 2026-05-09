import { useState } from 'react'
import type { ChannelListItem } from '../api/channels'
import { SidebarRow } from './SidebarRow'
import { ConfirmDialog } from './ConfirmDialog'

interface ChatChannelListProps {
  channels: ChannelListItem[]
  activeChannel: string
  onSelect: (id: string) => void
  onEdit: (channel: ChannelListItem) => void
  onDelete: (id: string) => Promise<void>
}

export function ChatChannelList({
  channels,
  activeChannel,
  onSelect,
  onEdit,
  onDelete,
}: ChatChannelListProps) {
  // Channel pending delete confirmation. Tiny × buttons in a sidebar are
  // easy to mis-click — the dialog forces an explicit yes.
  const [pendingDelete, setPendingDelete] = useState<ChannelListItem | null>(null)

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await onDelete(pendingDelete.id)
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <>
      <div className="py-0.5">
        {channels.map((ch) => {
          // 'default' is editable but not deletable — it's the connector's
          // default-session pointer and must keep existing.
          const deletable = ch.id !== 'default'
          return (
            <SidebarRow
              key={ch.id}
              label={
                <>
                  <span className="text-text-muted/60 mr-0.5">#</span>
                  {ch.label}
                </>
              }
              active={activeChannel === ch.id}
              onClick={() => onSelect(ch.id)}
              trail={
                <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(ch) }}
                    className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-secondary"
                    title="Settings"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </button>
                  {deletable && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(ch) }}
                      className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-400/10"
                      title="Delete"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </span>
              }
            />
          )
        })}

        {channels.length === 0 && (
          <p className="px-3 py-2 text-[12px] text-text-muted/60">Loading…</p>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete channel"
          message={
            <>
              Delete channel <span className="font-mono text-text">#{pendingDelete.label}</span>?
              The session history stays on disk, but the channel will disappear from the sidebar
              and any open tab for it will close. This can&apos;t be undone from the UI.
            </>
          }
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}
