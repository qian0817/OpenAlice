import { useEffect, useState } from 'react'
import { marketApi, type KeyMetrics, type FinancialRatios } from '../../api/market'
import { Card } from './Card'
import { fmtNumber, fmtPercent, fmtMoneyShort } from './format'

interface Props {
  symbol: string
}

type Loaded = { metrics: KeyMetrics | null; ratios: FinancialRatios | null }

export function KeyMetricsPanel({ symbol }: Props) {
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([marketApi.equity.metrics(symbol), marketApi.equity.ratios(symbol)])
      .then(([m, r]) => {
        if (cancelled) return
        const err = m.error ?? r.error
        if (err) setError(err)
        setData({ metrics: m.results?.[0] ?? null, ratios: r.results?.[0] ?? null })
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  const m = data?.metrics ?? {}
  const r = data?.ratios ?? {}
  // Ratios gives us valuation + margins; metrics gives market_cap, EV, ROE/ROA.
  // Merge with metrics winning where both have a key.
  const both = { ...r, ...m } as Record<string, unknown>

  // Curated list of what most investors glance at. FMP's live schema uses
  // snake_case for canonical fields and *TTM camelCase for trailing variants;
  // we pick snake_case first and fall back where the canonical is missing.
  const rows: Array<[string, string]> = [
    ['P/E',           fmtNumber(both.price_to_earnings)],
    ['PEG',           fmtNumber(both.priceToEarningsGrowthRatioTTM)],
    ['P/S',           fmtNumber(both.price_to_sales)],
    ['P/B',           fmtNumber(both.price_to_book)],
    ['EV/EBITDA',     fmtNumber(both.ev_to_ebitda)],
    ['EV/Sales',      fmtNumber(both.ev_to_sales)],
    ['Div Yield',     fmtPercent(both.dividend_yield)],
    ['ROE',           fmtPercent(both.return_on_equity)],
    ['ROA',           fmtPercent(both.return_on_assets)],
    ['Gross Margin',  fmtPercent(both.gross_profit_margin)],
    ['Op Margin',     fmtPercent(both.operating_profit_margin)],
    ['Net Margin',    fmtPercent(both.net_profit_margin)],
    ['Debt/Equity',   fmtNumber(both.debt_to_equity)],
    ['Current Ratio', fmtNumber(both.current_ratio)],
    ['Market Cap',    fmtMoneyShort(both.marketCap ?? both.market_cap)],
    ['Enterprise V',  fmtMoneyShort(both.enterprise_value)],
  ]

  return (
    <Card title="Key Metrics">
      {loading && <div className="text-[12px] text-text-muted">Loading…</div>}
      {error && !loading && <div className="text-[12px] text-red-400">{error}</div>}
      {!loading && !error && data && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-b border-border/30 py-1 last:border-b-0">
              <dt className="text-text-muted/70">{k}</dt>
              <dd className="font-mono text-text tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}
