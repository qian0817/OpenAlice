import { useWorkspace } from '../tabs/store'
import { getFocusedTab, type ViewSpec } from '../tabs/types'
import { SidebarRow } from './SidebarRow'

type SettingsCategory = Extract<ViewSpec, { kind: 'settings' }>['params']['category']

interface CategoryItem {
  label: string
  category: SettingsCategory
  /**
   * Other view kinds that count as "active" for this row. Used by
   * Trading Accounts: when a uta-detail tab is focused, Trading
   * Accounts should still light up.
   */
  alsoActiveFor?: ViewSpec['kind'][]
}

const CATEGORIES: CategoryItem[] = [
  { label: 'General', category: 'general' },
  { label: 'AI Provider', category: 'ai-provider' },
  { label: 'Trading Accounts', category: 'trading', alsoActiveFor: ['uta-detail'] },
  { label: 'Connectors', category: 'connectors' },
  { label: 'Market Data', category: 'market-data' },
  { label: 'News Sources', category: 'news-collector' },
]

/**
 * Settings sidebar — flat list of config categories. Click opens (or
 * focuses) the corresponding tab. Active highlight is driven by the
 * currently-focused tab's spec, not by sidebar selection.
 */
export function SettingsCategoryList() {
  const focused = useWorkspace((state) => getFocusedTab(state)?.spec)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)

  return (
    <div className="py-0.5">
      {CATEGORIES.map((item) => {
        const active =
          (focused?.kind === 'settings' && focused.params.category === item.category) ||
          (item.alsoActiveFor != null && focused != null && item.alsoActiveFor.includes(focused.kind))
        return (
          <SidebarRow
            key={item.category}
            label={item.label}
            active={active}
            onClick={() => openOrFocus({ kind: 'settings', params: { category: item.category } })}
          />
        )
      })}
    </div>
  )
}
