import { useWorkspace } from '../tabs/store'
import { getFocusedTab } from '../tabs/types'
import { SidebarRow } from './SidebarRow'

/**
 * Diary sidebar — phase-2 placeholder. Single "All Entries" item that
 * opens the existing DiaryPage as a tab. Phase 3+ replaces this with a
 * date-organised navigator that opens per-day tabs.
 */
export function DiarySidebar() {
  const focusedKind = useWorkspace((state) => getFocusedTab(state)?.spec.kind ?? null)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)

  return (
    <div className="py-0.5">
      <SidebarRow
        label="All Entries"
        active={focusedKind === 'diary'}
        onClick={() => openOrFocus({ kind: 'diary', params: {} })}
      />
    </div>
  )
}
