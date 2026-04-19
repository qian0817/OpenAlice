import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { BrainCommit, BrainState } from '../api/brain'
import { MarkdownContent } from './MarkdownContent'

// Match DiaryPage cadence — brain changes are lower-frequency than heartbeat cycles.
const POLL_INTERVAL_MS = 60_000

type Variant = 'sidebar' | 'flat'

// ==================== Public wrapper ====================

/**
 * Brain state panel — read-only dashboard showing current frontal lobe + emotion
 * with a click-to-expand history dialog for each dimension.
 *
 * Two variants:
 *   - sidebar: always-expanded, rendered as a right-side column on wide screens
 *   - flat: default-collapsed panels, rendered above the feed on narrow screens
 */
export function BrainSidebar({ variant }: { variant: Variant }) {
  const [state, setState] = useState<BrainState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    try {
      const s = await api.brain.state()
      setState(s)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { fetchState() }, [fetchState])

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchState()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchState])

  useEffect(() => {
    const onFocus = () => { fetchState() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchState])

  const frontalCommits = useMemo(
    () => (state?.commits ?? []).filter((c) => c.type === 'frontal_lobe'),
    [state],
  )
  const emotionCommits = useMemo(
    () => (state?.commits ?? []).filter((c) => c.type === 'emotion'),
    [state],
  )

  if (error) {
    return (
      <div className="text-[11px] text-red/80 px-3 py-2">
        Brain: {error}
      </div>
    )
  }

  return (
    <div className={variant === 'sidebar' ? 'flex flex-col gap-4' : 'flex flex-col gap-2'}>
      <FrontalLobePanel
        variant={variant}
        current={state?.frontalLobe ?? ''}
        commits={frontalCommits}
      />
      <EmotionPanel
        variant={variant}
        current={state?.emotion ?? 'neutral'}
        commits={emotionCommits}
      />
    </div>
  )
}

// ==================== Frontal Lobe panel ====================

function FrontalLobePanel({
  variant,
  current,
  commits,
}: {
  variant: Variant
  current: string
  commits: BrainCommit[]
}) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const body = current
    ? <MarkdownContent text={current} />
    : <span className="text-[12px] text-text-muted/50 italic">(empty)</span>

  return (
    <>
      <CollapsiblePanel
        variant={variant}
        title="Frontal Lobe"
        subtitle={commits.length > 0 ? `${commits.length} version${commits.length === 1 ? '' : 's'}` : undefined}
        onExpand={commits.length > 0 ? () => setDialogOpen(true) : undefined}
      >
        <div className="text-[13px] leading-relaxed text-text/90">
          {body}
        </div>
      </CollapsiblePanel>
      {dialogOpen && (
        <HistoryDialog
          title="Frontal Lobe — history"
          onClose={() => setDialogOpen(false)}
        >
          {commits.slice().reverse().map((c) => (
            <article
              key={c.hash}
              className="rounded-lg border border-border/40 bg-bg-secondary/30 p-3"
            >
              <header className="text-[11px] text-text-muted/70 tabular-nums mb-2">
                {formatTimestamp(c.timestamp)}
              </header>
              <div className="text-[13px] leading-relaxed text-text/90">
                {c.stateAfter.frontalLobe
                  ? <MarkdownContent text={c.stateAfter.frontalLobe} />
                  : <span className="text-text-muted/50 italic">(empty)</span>}
              </div>
            </article>
          ))}
        </HistoryDialog>
      )}
    </>
  )
}

// ==================== Emotion panel ====================

function EmotionPanel({
  variant,
  current,
  commits,
}: {
  variant: Variant
  current: string
  commits: BrainCommit[]
}) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <CollapsiblePanel
        variant={variant}
        title="Emotion"
        subtitle={commits.length > 0 ? `${commits.length} change${commits.length === 1 ? '' : 's'}` : undefined}
        onExpand={commits.length > 0 ? () => setDialogOpen(true) : undefined}
      >
        <div className="flex items-center">
          <EmotionChip emotion={current} />
        </div>
      </CollapsiblePanel>
      {dialogOpen && (
        <HistoryDialog
          title="Emotion — history"
          onClose={() => setDialogOpen(false)}
        >
          {commits.slice().reverse().map((c, i, arr) => {
            // Walk the reversed list: the "from" is the stateAfter of the next (older) commit.
            const prev = arr[i + 1]?.stateAfter.emotion ?? 'unknown'
            return (
              <article
                key={c.hash}
                className="rounded-lg border border-border/40 bg-bg-secondary/30 p-3"
              >
                <header className="flex items-center gap-2 text-[11px] text-text-muted/70 mb-2">
                  <span className="tabular-nums">{formatTimestamp(c.timestamp)}</span>
                </header>
                <div className="flex items-center gap-2 mb-2 text-[12px]">
                  <EmotionChip emotion={prev} muted />
                  <span className="text-text-muted/60">→</span>
                  <EmotionChip emotion={c.stateAfter.emotion} />
                </div>
                {c.message && (
                  <div className="text-[12.5px] leading-relaxed text-text/80">
                    {c.message}
                  </div>
                )}
              </article>
            )
          })}
        </HistoryDialog>
      )}
    </>
  )
}

// ==================== CollapsiblePanel ====================

function CollapsiblePanel({
  variant,
  title,
  subtitle,
  onExpand,
  children,
}: {
  variant: Variant
  title: string
  subtitle?: string
  onExpand?: () => void
  children: ReactNode
}) {
  // On narrow screens, panels fold by default so they don't steal scroll space above the feed.
  // On wide screens, the sidebar panels stay open.
  const [open, setOpen] = useState(variant === 'sidebar')

  return (
    <section className="rounded-xl border border-border/40 bg-bg-secondary/20 overflow-hidden">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
        {variant === 'flat' ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-text hover:text-accent transition-colors"
            aria-expanded={open}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${open ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {title}
          </button>
        ) : (
          <span className="text-[12px] font-medium text-text tracking-wide">{title}</span>
        )}
        {subtitle && (
          <span className="text-[10.5px] text-text-muted/60 tabular-nums">{subtitle}</span>
        )}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="ml-auto text-text-muted/70 hover:text-accent p-1 -m-1 rounded transition-colors"
            title="View history"
            aria-label="View history"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}
      </header>
      {open && <div className="px-3 py-3">{children}</div>}
    </section>
  )
}

// ==================== HistoryDialog ====================

function HistoryDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-bg border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  )
}

// ==================== EmotionChip ====================

function EmotionChip({ emotion, muted = false }: { emotion: string; muted?: boolean }) {
  const tone = emotionTone(emotion)
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border tabular-nums'
  const mutedCls = 'border-border/40 text-text-muted/70'
  const cls = muted ? `${base} ${mutedCls}` : `${base} ${tone}`
  return <span className={cls}>{emotion}</span>
}

// Loose keyword-based tone mapping — keeps visual variety without a hardcoded enum.
// Alice writes free-form emotion strings (fearful, cautious, neutral, confident, euphoric, ...),
// so we pattern-match rather than switch on exact values.
function emotionTone(emotion: string): string {
  const e = emotion.toLowerCase()
  if (/(euphor|elat|excit|bullish)/.test(e)) return 'border-accent/50 text-accent bg-accent/10'
  if (/(confident|optim|steady|calm)/.test(e)) return 'border-accent/40 text-accent bg-accent/5'
  if (/(caut|worr|uncert|anxi)/.test(e)) return 'border-amber-500/40 text-amber-500 bg-amber-500/5'
  if (/(fear|panic|bear|scared)/.test(e)) return 'border-red/40 text-red bg-red/5'
  return 'border-border/40 text-text-muted'
}

// ==================== Helpers ====================

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}
