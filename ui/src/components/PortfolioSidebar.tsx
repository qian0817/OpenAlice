import { useTradingConfig } from '../hooks/useTradingConfig'
import { useWorkspace } from '../tabs/store'
import { getFocusedTab } from '../tabs/types'

/**
 * Portfolio sidebar — Overview + per-UTA accounts.
 *
 * - "Overview" opens the aggregate portfolio tab (`kind: 'portfolio'`).
 * - Each UTA row opens that account's detail tab (`kind: 'uta-detail'`).
 *
 * Active highlight is derived from the focused tab's spec, not from the
 * sidebar selection itself — focus and sidebar are independent.
 */
export function PortfolioSidebar() {
  const { utas, loading } = useTradingConfig()
  const focused = useWorkspace((state) => getFocusedTab(state)?.spec)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)

  const overviewActive = focused?.kind === 'portfolio'
  const focusedUtaId =
    focused?.kind === 'uta-detail' ? focused.params.id : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0 py-0.5">
        <SidebarSectionHeader>Overview</SidebarSectionHeader>
        <button
          type="button"
          onClick={() => openOrFocus({ kind: 'portfolio', params: {} })}
          className={`w-full text-left flex items-center gap-1 px-3 py-1 text-[13px] transition-colors ${
            overviewActive
              ? 'bg-bg-tertiary text-text'
              : 'text-text-muted hover:text-text hover:bg-bg-tertiary/50'
          }`}
        >
          All Accounts
        </button>

        <SidebarSectionHeader>
          Accounts{!loading && utas.length > 0 ? ` (${utas.length})` : ''}
        </SidebarSectionHeader>

        {loading ? (
          <p className="px-3 py-1 text-[12px] text-text-muted/60">Loading…</p>
        ) : utas.length === 0 ? (
          <p className="px-3 py-1 text-[12px] text-text-muted/60 leading-snug">
            No accounts yet. Add one in Settings → Trading Accounts.
          </p>
        ) : (
          utas.map((uta) => {
            const active = focusedUtaId === uta.id
            const display = uta.label?.trim() || uta.id
            return (
              <button
                key={uta.id}
                type="button"
                onClick={() =>
                  openOrFocus({ kind: 'uta-detail', params: { id: uta.id } })
                }
                className={`w-full text-left flex items-center gap-1.5 px-3 py-1 text-[13px] transition-colors ${
                  active
                    ? 'bg-bg-tertiary text-text'
                    : 'text-text-muted hover:text-text hover:bg-bg-tertiary/50'
                } ${uta.enabled ? '' : 'opacity-60'}`}
              >
                <span className="truncate flex-1">{display}</span>
                {!uta.enabled && (
                  <span className="text-[9px] uppercase tracking-wide text-text-muted/60">off</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function SidebarSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-3 mt-3 mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted/60 select-none">
      {children}
    </h3>
  )
}
