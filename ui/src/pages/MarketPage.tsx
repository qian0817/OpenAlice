import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { SearchBox } from '../components/market/SearchBox'
import { KlinePanel } from '../components/market/KlinePanel'
import type { AssetClass, SearchResult } from '../api/market'

export function MarketPage() {
  const [selection, setSelection] = useState<{ symbol: string; assetClass: AssetClass } | null>(null)

  const handleSelect = (r: SearchResult) => {
    const sym = r.symbol ?? r.id
    if (!sym) return
    setSelection({ symbol: sym, assetClass: r.assetClass })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Market" description="Search assets and view price history." />
      <div className="flex-1 flex flex-col gap-3 px-4 md:px-8 py-4 min-h-0">
        <SearchBox onSelect={handleSelect} />
        <div className="flex-1 min-h-0">
          <KlinePanel selection={selection} />
        </div>
      </div>
    </div>
  )
}
