/**
 * AkShare Equity Client
 *
 * HTTP client that talks to the AkShare Python sidecar (default: http://localhost:8001).
 * Implements EquityClientLike so it can be used anywhere an equity client is expected.
 *
 * Symbol format: 600519.SH (Shanghai) / 000001.SZ (Shenzhen)
 */

import type {
  EquitySearchData, EquityHistoricalData, EquityInfoData, KeyMetricsData,
  IncomeStatementData, BalanceSheetData, CashFlowStatementData, FinancialRatiosData,
  PriceTargetConsensusData, CalendarEarningsData, InsiderTradingData, EquityDiscoveryData,
} from '@traderalice/opentypebb'
import type { EquityClientLike } from '../types.js'

export class AkshareEquityClient implements EquityClientLike {
  private baseUrl: string

  constructor(baseUrl = 'http://localhost:8001') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  // ==================== Core methods ====================

  async search(params: Record<string, unknown>): Promise<EquitySearchData[]> {
    const data = await this.get<{ results: Array<Record<string, unknown>> }>('/stock/list')
    const query = (params.query as string | undefined) ?? ''
    const results = data.results ?? []

    if (!query) return results as unknown as EquitySearchData[]

    const lower = query.toLowerCase()
    return results.filter((r) => {
      const symbol = (r.symbol as string ?? '').toLowerCase()
      const name = (r.name as string ?? '').toLowerCase()
      return symbol.includes(lower) || name.includes(lower)
    }) as unknown as EquitySearchData[]
  }

  async getHistorical(params: Record<string, unknown>): Promise<EquityHistoricalData[]> {
    const { symbol, start_date, end_date, period, adjust } = params as {
      symbol: string
      start_date?: string
      end_date?: string
      period?: string
      adjust?: string
    }

    const q = new URLSearchParams({ symbol })
    if (start_date) q.set('start_date', start_date.replace(/-/g, ''))
    if (end_date) q.set('end_date', end_date.replace(/-/g, ''))
    if (period) q.set('period', period)
    if (adjust !== undefined) q.set('adjust', adjust)

    const data = await this.get<{ results: Array<Record<string, unknown>> }>(`/stock/history?${q}`)
    return (data.results ?? []).map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      vwap: r.close, // AkShare doesn't provide VWAP directly
      ...r,
    })) as unknown as EquityHistoricalData[]
  }

  async getProfile(params: Record<string, unknown>): Promise<EquityInfoData[]> {
    const { symbol } = params as { symbol: string }
    const data = await this.get<{ results: Array<Record<string, unknown>> }>(
      `/stock/profile?symbol=${encodeURIComponent(symbol)}`,
    )
    return (data.results ?? []).map((r) => ({
      symbol: r.symbol,
      name: r.name,
      stock_exchange: r.stock_exchange,
      sector: r.industry,
      industry_category: r.industry,
      ...r,
    })) as unknown as EquityInfoData[]
  }

  async getKeyMetrics(params: Record<string, unknown>): Promise<KeyMetricsData[]> {
    const { symbol } = params as { symbol: string }
    const data = await this.get<{ results: Array<Record<string, unknown>> }>('/stock/quote')
    const quote = (data.results ?? []).find(
      (r) => (r.symbol as string)?.toUpperCase() === (symbol as string)?.toUpperCase(),
    )
    if (!quote) return []
    return [{ symbol: quote.symbol, market_cap: quote.market_cap }] as unknown as KeyMetricsData[]
  }

  async getGainers(_params?: Record<string, unknown>): Promise<EquityDiscoveryData[]> {
    const data = await this.get<{ results: Array<Record<string, unknown>> }>('/stock/quote')
    const results = (data.results ?? [])
      .filter((r) => typeof r.change_pct === 'number')
      .sort((a, b) => (b.change_pct as number) - (a.change_pct as number))
      .slice(0, 20)
    return results as unknown as EquityDiscoveryData[]
  }

  async getLosers(_params?: Record<string, unknown>): Promise<EquityDiscoveryData[]> {
    const data = await this.get<{ results: Array<Record<string, unknown>> }>('/stock/quote')
    const results = (data.results ?? [])
      .filter((r) => typeof r.change_pct === 'number')
      .sort((a, b) => (a.change_pct as number) - (b.change_pct as number))
      .slice(0, 20)
    return results as unknown as EquityDiscoveryData[]
  }

  async getActive(_params?: Record<string, unknown>): Promise<EquityDiscoveryData[]> {
    const data = await this.get<{ results: Array<Record<string, unknown>> }>('/stock/quote')
    const results = (data.results ?? [])
      .filter((r) => typeof r.turnover === 'number')
      .sort((a, b) => (b.turnover as number) - (a.turnover as number))
      .slice(0, 20)
    return results as unknown as EquityDiscoveryData[]
  }

  // ==================== Financial statements ====================

  async getIncomeStatement(params: Record<string, unknown>): Promise<IncomeStatementData[]> {
    const { symbol, limit } = params as { symbol: string; limit?: number }
    const q = new URLSearchParams({ symbol })
    if (limit) q.set('limit', String(limit))
    const data = await this.get<{ results: Array<Record<string, unknown>> }>(
      `/stock/financials/income?${q}`,
    )
    return (data.results ?? []) as unknown as IncomeStatementData[]
  }

  async getBalanceSheet(params: Record<string, unknown>): Promise<BalanceSheetData[]> {
    const { symbol, limit } = params as { symbol: string; limit?: number }
    const q = new URLSearchParams({ symbol })
    if (limit) q.set('limit', String(limit))
    const data = await this.get<{ results: Array<Record<string, unknown>> }>(
      `/stock/financials/balance?${q}`,
    )
    return (data.results ?? []) as unknown as BalanceSheetData[]
  }

  async getCashFlow(params: Record<string, unknown>): Promise<CashFlowStatementData[]> {
    const { symbol, limit } = params as { symbol: string; limit?: number }
    const q = new URLSearchParams({ symbol })
    if (limit) q.set('limit', String(limit))
    const data = await this.get<{ results: Array<Record<string, unknown>> }>(
      `/stock/financials/cashflow?${q}`,
    )
    return (data.results ?? []) as unknown as CashFlowStatementData[]
  }

  async getFinancialRatios(params: Record<string, unknown>): Promise<FinancialRatiosData[]> {
    const { symbol, limit } = params as { symbol: string; limit?: number }
    const q = new URLSearchParams({ symbol })
    if (limit) q.set('limit', String(limit))
    const data = await this.get<{ results: Array<Record<string, unknown>> }>(
      `/stock/financials/ratios?${q}`,
    )
    return (data.results ?? []) as unknown as FinancialRatiosData[]
  }

  async getCalendarEarnings(params: Record<string, unknown>): Promise<CalendarEarningsData[]> {
    const { symbol, period, limit } = params as {
      symbol: string
      period?: string
      limit?: number
    }
    const q = new URLSearchParams({ symbol })
    if (period) q.set('period', period)
    if (limit) q.set('limit', String(limit))
    const data = await this.get<{ results: Array<Record<string, unknown>> }>(
      `/stock/financials/calendar?${q}`,
    )
    return (data.results ?? []) as unknown as CalendarEarningsData[]
  }

  async getEstimateConsensus(_params: Record<string, unknown>): Promise<PriceTargetConsensusData[]> { return [] }
  async getInsiderTrading(_params: Record<string, unknown>): Promise<InsiderTradingData[]> { return [] }

  // ==================== Internal ====================

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`AkShare sidecar error ${res.status} on ${path}: ${body.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  }
}
