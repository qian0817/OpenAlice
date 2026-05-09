/**
 * Section config — what the secondary sidebar shows for each ActivitySection.
 *
 * Sidebar selection is driven by `selectedSidebar` in the workspace store,
 * which the ActivityBar updates via `toggleSidebar`. Sidebar content is
 * decoupled from focused-tab kind: switching tabs doesn't change which
 * sidebar shows.
 *
 * Routes have moved to tabs/UrlAdopter.tsx (URL → spec adoption) and
 * tabs/registry.tsx (spec → URL projection). This file is now just the
 * activity-section → sidebar lookup.
 */

import type { ComponentType } from 'react'
import { ChatChannelListContainer } from './components/ChatChannelListContainer'
import { NewChannelButton } from './components/NewChannelButton'
import { PushApprovalPanel } from './components/PushApprovalPanel'
import { SettingsCategoryList } from './components/SettingsCategoryList'
import { DevCategoryList } from './components/DevCategoryList'
import { MarketSidebar } from './components/MarketSidebar'
import { PortfolioSidebar } from './components/PortfolioSidebar'
import { AutomationSidebar } from './components/AutomationSidebar'
import { NewsSidebar } from './components/NewsSidebar'
import { DiarySidebar } from './components/DiarySidebar'
import type { ActivitySection } from './tabs/types'

export interface SidebarSection {
  /** Header title shown at the top of the sidebar. */
  title: string
  /** The actual navigator content. */
  Secondary: ComponentType
  /** Optional right-aligned action buttons in the sidebar header (e.g. "+ new"). */
  Actions?: ComponentType
}

const SECTION_BY_KEY: Record<ActivitySection, SidebarSection> = {
  chat: {
    title: 'Chat',
    Secondary: ChatChannelListContainer,
    Actions: NewChannelButton,
  },
  'trading-as-git': {
    title: 'Trading as Git',
    Secondary: PushApprovalPanel,
  },
  settings: {
    title: 'Settings',
    Secondary: SettingsCategoryList,
  },
  dev: {
    title: 'Dev',
    Secondary: DevCategoryList,
  },
  market: {
    title: 'Market',
    Secondary: MarketSidebar,
  },
  portfolio: {
    title: 'Portfolio',
    Secondary: PortfolioSidebar,
  },
  automation: {
    title: 'Automation',
    Secondary: AutomationSidebar,
  },
  news: {
    title: 'News',
    Secondary: NewsSidebar,
  },
  diary: {
    title: 'Diary',
    Secondary: DiarySidebar,
  },
}

/** Resolve the sidebar config for the currently selected ActivitySection. */
export function findSectionForActivity(
  section: ActivitySection | null | undefined,
): SidebarSection | null {
  if (!section) return null
  return SECTION_BY_KEY[section]
}
