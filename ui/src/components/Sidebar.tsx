import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Resizer } from './Resizer'

interface SidebarProps {
  /** Header title — shown at the top of the sidebar (e.g. "CHAT", "SETTINGS"). */
  title: string
  /** Optional action buttons rendered right-aligned in the header (e.g. "+ new"). */
  actions?: ReactNode
  /** Scrollable body content — usually the activity-specific navigator (channel list, file tree, etc.). */
  children: ReactNode
}

const STORAGE_KEY = 'openalice.sidebar.width'
const DEFAULT_WIDTH = 240
const MIN_WIDTH = 150
const MAX_WIDTH = 500

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function loadStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? clamp(parsed, MIN_WIDTH, MAX_WIDTH) : DEFAULT_WIDTH
}

/**
 * VS Code-style Side Bar — sits between the Activity Bar and the Editor area.
 * Hosts the activity-specific navigator (channel list, file tree, search results,
 * deploy panel, etc.). Desktop only — hidden on mobile.
 *
 * Width is internally managed and persisted to localStorage. A resize handle
 * on the right edge lets users drag to adjust; double-click resets to default.
 */
export function Sidebar({ title, actions, children }: SidebarProps) {
  const [width, setWidth] = useState(loadStoredWidth)

  // Keep a ref synced with width so drag-start can read the latest value
  // without re-binding callbacks on every render.
  const widthRef = useRef(width)
  useEffect(() => { widthRef.current = width }, [width])

  // Persist whenever width changes (debounced is unnecessary — change rate is
  // bounded by user drag speed and only the final value matters).
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(width))
  }, [width])

  const dragStartWidthRef = useRef(DEFAULT_WIDTH)

  const handleResize = useCallback((delta: number, phase: 'start' | 'move' | 'end') => {
    if (phase === 'start') {
      dragStartWidthRef.current = widthRef.current
    } else if (phase === 'move') {
      setWidth(clamp(dragStartWidthRef.current + delta, MIN_WIDTH, MAX_WIDTH))
    }
    // 'end' — width already settled; localStorage useEffect handles persistence.
  }, [])

  const handleReset = useCallback(() => setWidth(DEFAULT_WIDTH), [])

  return (
    <aside
      className="hidden md:flex h-full flex-col bg-bg-secondary shrink-0 relative"
      style={{ width }}
    >
      <div className="flex items-center justify-between px-3 h-10 shrink-0">
        <h2 className="text-[13px] font-medium text-text">{title}</h2>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>

      {/* Drag handle on the right edge. Visible only on hover/active. */}
      <Resizer
        direction="horizontal"
        onResize={handleResize}
        onReset={handleReset}
        className="absolute top-0 right-0 bottom-0 w-1 z-10"
      />
    </aside>
  )
}
