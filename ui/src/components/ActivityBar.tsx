import { type ReactNode } from 'react'
import { type Page } from '../App'
import { useWorkspace } from '../tabs/store'
import type { ActivitySection, ViewSpec } from '../tabs/types'

/**
 * Map ActivityBar page enum (visual layout grouping) to the ActivitySection
 * used by the workspace store. Names are 1:1.
 */
function activitySectionFor(page: Page): ActivitySection {
  switch (page) {
    case 'chat':           return 'chat'
    case 'trading-as-git': return 'trading-as-git'
    case 'settings':       return 'settings'
    case 'dev':            return 'dev'
    case 'market':         return 'market'
    case 'portfolio':      return 'portfolio'
    case 'automation':     return 'automation'
    case 'news':           return 'news'
    case 'diary':          return 'diary'
  }
}

interface ActivityBarProps {
  open: boolean
  onClose: () => void
}

// ==================== Nav item definitions ====================

interface NavLeaf {
  page: Page
  label: string
  icon: (active: boolean) => ReactNode
  /**
   * What tab opens when this ActivityBar item is clicked.
   *
   * - **Set**: clicking the icon both reveals the sidebar AND opens (or
   *   focuses) this tab. Used for activities with a meaningful default
   *   landing page — e.g. Portfolio's Overview, Diary, News, Automation.
   * - **Omitted**: sidebar-only activity. Click reveals the sidebar; tabs
   *   are created from sidebar interactions. Used when there's no canonical
   *   "all of X" view (Chat, Settings, Dev) or no tab at all (Trading-as-Git).
   *
   * Same-section re-click always collapses the sidebar regardless of this
   * field; the focused tab isn't touched on collapse.
   */
  defaultTab?: ViewSpec
}

interface NavSection {
  sectionLabel: string
  items: NavLeaf[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    sectionLabel: '',
    items: [
      {
        page: 'chat',
        label: 'Chat',
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        ),
      },
      {
        page: 'portfolio',
        label: 'Portfolio',
        defaultTab: { kind: 'portfolio', params: {} },
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M7 10l3-3 2 2 5-5" />
          </svg>
        ),
      },
      {
        page: 'trading-as-git',
        label: 'Trading as Git',
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="2.5" />
            <circle cx="6" cy="18" r="2.5" />
            <circle cx="18" cy="12" r="2.5" />
            <path d="M6 8.5v7" />
            <path d="M8.5 6h4a3 3 0 0 1 3 3v0" />
            <path d="M8.5 18h4a3 3 0 0 0 3-3v0" />
          </svg>
        ),
      },
      {
        page: 'market',
        label: 'Market',
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4v16" />
            <rect x="5" y="8" width="4" height="8" rx="1" />
            <path d="M17 4v16" />
            <rect x="15" y="6" width="4" height="10" rx="1" />
          </svg>
        ),
      },
      {
        page: 'news',
        label: 'News',
        defaultTab: { kind: 'news', params: {} },
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9h4" />
            <path d="M10 7h8" />
            <path d="M10 11h8" />
            <path d="M10 15h4" />
          </svg>
        ),
      },
      {
        page: 'diary',
        label: 'Diary',
        defaultTab: { kind: 'diary', params: {} },
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    sectionLabel: 'Agent',
    items: [
      {
        page: 'automation',
        label: 'Automation',
        defaultTab: { kind: 'automation', params: { section: 'flow' } },
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        ),
      },
    ],
  },
  {
    sectionLabel: 'System',
    items: [
      {
        page: 'settings',
        label: 'Settings',
        icon: (active) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
      {
        page: 'dev' as const,
        label: 'Dev',
        icon: (active: boolean) => (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        ),
      },
    ],
  },
]

// ==================== Helpers ====================

/** Style for active indicator */
const INDICATOR_STYLE = { background: '#58a6ff' }

// ==================== ActivityBar ====================

export function ActivityBar({ open, onClose }: ActivityBarProps) {
  const selectedSidebar = useWorkspace((state) => state.selectedSidebar)
  const setSidebar = useWorkspace((state) => state.setSidebar)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* ActivityBar — mobile: 220px slide-in with labels; desktop: 56px icon-only column */}
      <aside
        className={`
          w-[220px] md:w-14 h-full flex flex-col shrink-0
          bg-bg-secondary md:bg-bg
          border-r border-border md:border-r-0
          fixed z-50 top-0 left-0 transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:static md:translate-x-0 md:z-auto md:transition-none
        `}
      >
        {/* Branding */}
        <div className="px-5 md:px-0 md:justify-center py-4 flex items-center gap-2.5">
          <img
            src="/alice.ico"
            alt="Alice"
            className="w-7 h-7 rounded-lg ring-1 ring-accent/25 shadow-[0_0_8px_rgba(88,166,255,0.15)]"
            draggable={false}
          />
          <h1 className="text-[15px] font-semibold text-text md:hidden">OpenAlice</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col px-2 md:px-1.5 overflow-y-auto">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-4 md:mt-2' : ''}>
              {section.sectionLabel && (
                <p className="px-3 mb-1 text-[11px] font-medium text-text-muted/50 uppercase tracking-wider md:hidden">
                  {section.sectionLabel}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const sec = activitySectionFor(item.page)
                  const isActive = selectedSidebar === sec
                  const handleClick = () => {
                    onClose()
                    if (selectedSidebar === sec) {
                      // Same section re-clicked: toggle sidebar off. Don't
                      // touch the focused tab — collapsing the sidebar
                      // shouldn't change what's in the editor.
                      setSidebar(null)
                    } else {
                      setSidebar(sec)
                      // Activities with a meaningful default landing (e.g.
                      // Portfolio overview) jump straight to it. Sidebar-only
                      // activities (Chat, Settings, Trading-as-Git, …) leave
                      // tab focus alone — user picks from the sidebar.
                      if (item.defaultTab) openOrFocus(item.defaultTab)
                    }
                  }
                  return (
                    <button
                      key={item.page}
                      type="button"
                      onClick={handleClick}
                      title={item.label}
                      className={`relative flex items-center gap-3 px-3 py-2 md:px-0 md:py-2.5 md:rounded-none md:justify-center rounded-lg text-sm transition-colors text-left ${
                        isActive
                          ? 'bg-bg-tertiary text-text md:bg-transparent'
                          : 'text-text-muted hover:text-text hover:bg-bg-tertiary/50 md:hover:bg-bg-secondary'
                      }`}
                    >
                      <span
                        className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full transition-opacity duration-150 hidden md:block ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={INDICATOR_STYLE}
                      />
                      <span className={`flex items-center justify-center w-5 h-5 ${isActive ? 'md:text-text' : ''}`}>{item.icon(isActive)}</span>
                      <span className="md:hidden">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

      </aside>
    </>
  )
}
