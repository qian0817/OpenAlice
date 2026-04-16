/**
 * China A-Share Symbol Index
 *
 * Local regex-based search over the full A-share listing fetched from AkShare.
 * Cache path: data/cache/china-equity/symbols.json (TTL 24h)
 *
 * Symbol format: 600519.SH (Shanghai) / 000001.SZ (Shenzhen)
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { resolve, dirname } from 'path'
import type { EquityClientLike } from '../client/types.js'

// ==================== Types ====================

export interface ChinaSymbolEntry {
  symbol: string
  name: string
  source: string
  [key: string]: unknown
}

interface CacheEnvelope {
  cachedAt: string
  source: string
  count: number
  entries: ChinaSymbolEntry[]
}

// ==================== Config ====================

const CACHE_FILE = resolve('data/cache/china-equity/symbols.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const SOURCE = 'akshare'

// ==================== ChinaSymbolIndex ====================

export class ChinaSymbolIndex {
  private entries: ChinaSymbolEntry[] = []

  /** Index size */
  get size(): number {
    return this.entries.length
  }

  /**
   * Load symbol index.
   *
   * Prefers disk cache (<24h), then fetches from AkShare client.
   * Falls back to stale cache on error. Starts with empty index on total failure.
   */
  async load(client: EquityClientLike): Promise<void> {
    // 1. Try disk cache
    const cached = await this.readCache()
    if (cached && !this.isExpired(cached.cachedAt)) {
      this.entries = cached.entries
      console.log(`china-equity: loaded ${this.entries.length} symbols from cache (${SOURCE})`)
      return
    }

    // 2. Fetch from AkShare client
    try {
      const results = await client.search({ query: '' })
      const entries: ChinaSymbolEntry[] = results.map((r) => {
        const raw = r as Record<string, unknown>
        return {
          symbol: (raw.symbol as string) ?? '',
          name: (raw.name as string) ?? '',
          source: SOURCE,
        }
      }).filter((e) => e.symbol)

      this.entries = entries
      await this.writeCache(entries)
      console.log(`china-equity: fetched ${entries.length} symbols from API (${SOURCE})`)
      return
    } catch (err) {
      console.warn('china-equity: API fetch failed:', err)
    }

    // 3. Fall back to stale cache
    if (cached) {
      this.entries = cached.entries
      console.warn(`china-equity: using expired cache (${cached.cachedAt}), ${this.entries.length} symbols`)
      return
    }

    // 4. No data available
    console.warn('china-equity: no symbol data available, starting with empty index')
  }

  /**
   * Search by regex pattern.
   * Matches symbol (e.g., "600519", "600519.SH") and company name (e.g., "贵州茅台").
   * Falls back to substring match on invalid regex.
   */
  search(pattern: string, limit = 20): ChinaSymbolEntry[] {
    let test: (s: string) => boolean

    try {
      const re = new RegExp(pattern, 'i')
      test = (s) => re.test(s)
    } catch {
      const lower = pattern.toLowerCase()
      test = (s) => s.toLowerCase().includes(lower)
    }

    const results: ChinaSymbolEntry[] = []
    for (const entry of this.entries) {
      if (test(entry.symbol) || test(entry.name)) {
        results.push(entry)
        if (results.length >= limit) break
      }
    }
    return results
  }

  /** Exact case-insensitive symbol match */
  resolve(symbol: string): ChinaSymbolEntry | undefined {
    const upper = symbol.toUpperCase()
    return this.entries.find((e) => e.symbol.toUpperCase() === upper)
  }

  // ==================== Internal ====================

  private async readCache(): Promise<CacheEnvelope | null> {
    try {
      const raw = await readFile(CACHE_FILE, 'utf-8')
      return JSON.parse(raw) as CacheEnvelope
    } catch {
      return null
    }
  }

  private async writeCache(entries: ChinaSymbolEntry[]): Promise<void> {
    try {
      await mkdir(dirname(CACHE_FILE), { recursive: true })
      const envelope: CacheEnvelope = {
        cachedAt: new Date().toISOString(),
        source: SOURCE,
        count: entries.length,
        entries,
      }
      await writeFile(CACHE_FILE, JSON.stringify(envelope))
    } catch {
      // Cache write failure is non-fatal
    }
  }

  private isExpired(cachedAt: string): boolean {
    return Date.now() - new Date(cachedAt).getTime() > CACHE_TTL_MS
  }
}
