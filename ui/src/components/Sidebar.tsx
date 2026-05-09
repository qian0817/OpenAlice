import type { ReactNode } from 'react'

interface SidebarProps {
  /** Header title — shown at the top of the sidebar (e.g. "CHAT", "SETTINGS"). */
  title: string
  /** Optional action buttons rendered right-aligned in the header (e.g. "+ new"). */
  actions?: ReactNode
  /** Scrollable body content — usually the activity-specific navigator (channel list, file tree, etc.). */
  children: ReactNode
}

/**
 * VS Code-style Side Bar — sits between the Activity Bar and the Editor area.
 * Hosts the activity-specific navigator (channel list, file tree, search results,
 * deploy panel, etc.). Desktop only — hidden on mobile.
 *
 * Width and resize are managed by the surrounding Group (react-resizable-panels)
 * at the App layout level. This component is a pure content wrapper.
 */
export function Sidebar({ title, actions, children }: SidebarProps) {
  return (
    <aside className="hidden md:flex h-full w-full flex-col bg-bg-secondary">
      <div className="flex items-center justify-between px-3 h-10 shrink-0">
        <h2 className="text-[13px] font-medium text-text">{title}</h2>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </aside>
  )
}
