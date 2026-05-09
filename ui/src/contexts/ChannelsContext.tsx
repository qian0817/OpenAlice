import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { ChannelListItem } from '../api/channels'
import { useWorkspace } from '../tabs/store'

/** Channel-config dialog mode (create new vs edit existing). */
export type ChannelDialog =
  | { mode: 'create' }
  | { mode: 'edit'; channel: ChannelListItem }
  | null

interface ChannelsContextValue {
  channels: ChannelListItem[]
  channelDialog: ChannelDialog
  openCreateDialog: () => void
  openEditDialog: (channel: ChannelListItem) => void
  closeDialog: () => void
  deleteChannel: (id: string) => Promise<void>
  /** Called by ChannelConfigModal when its save (create or edit) succeeds. */
  onChannelSaved: (channel: ChannelListItem) => void
}

const ChannelsContext = createContext<ChannelsContextValue | null>(null)

/**
 * App-level provider for chat-channel state.
 *
 * Holds the channel list and the create/edit dialog state. The notion of
 * "active channel" lives in the workspace store now — each chat tab carries
 * its own channelId in its ViewSpec, so there's no app-wide singleton.
 */
export function ChannelsProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<ChannelListItem[]>([])
  const [channelDialog, setChannelDialog] = useState<ChannelDialog>(null)

  useEffect(() => {
    api.channels.list().then(({ channels: ch }) => setChannels(ch)).catch(() => {})
  }, [])

  const openCreateDialog = useCallback(() => setChannelDialog({ mode: 'create' }), [])
  const openEditDialog = useCallback((channel: ChannelListItem) => setChannelDialog({ mode: 'edit', channel }), [])
  const closeDialog = useCallback(() => setChannelDialog(null), [])

  const deleteChannel = useCallback(async (id: string) => {
    try {
      await api.channels.remove(id)
      setChannels((prev) => prev.filter((ch) => ch.id !== id))
      // Close any open chat tab pointing at the now-deleted channel.
      useWorkspace.getState().closeMatching(
        (spec) => spec.kind === 'chat' && spec.params.channelId === id,
      )
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }, [])

  const onChannelSaved = useCallback((saved: ChannelListItem) => {
    setChannels((prev) => {
      const exists = prev.some((ch) => ch.id === saved.id)
      return exists ? prev.map((ch) => ch.id === saved.id ? saved : ch) : [...prev, saved]
    })
    // For create-mode saves, open the new channel as a fresh tab and focus it.
    setChannelDialog((dialog) => {
      if (dialog?.mode === 'create') {
        useWorkspace.getState().openOrFocus({
          kind: 'chat',
          params: { channelId: saved.id },
        })
      }
      return null
    })
  }, [])

  const value: ChannelsContextValue = {
    channels,
    channelDialog,
    openCreateDialog,
    openEditDialog,
    closeDialog,
    deleteChannel,
    onChannelSaved,
  }

  return <ChannelsContext.Provider value={value}>{children}</ChannelsContext.Provider>
}

export function useChannels(): ChannelsContextValue {
  const ctx = useContext(ChannelsContext)
  if (!ctx) throw new Error('useChannels must be used within ChannelsProvider')
  return ctx
}
