/**
 * China A-Share Equity AI Tools
 *
 * chinaEquityGetHistory  — 获取A股历史行情（日/周/月线）
 * chinaEquityGetProfile  — 获取股票基本信息
 * chinaEquityDiscover    — 涨跌榜/成交量榜（gainers/losers/active）
 *
 * Symbol format: 600519.SH (Shanghai) / 000001.SZ (Shenzhen)
 * Data source: AkShare sidecar (http://localhost:8001)
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { EquityClientLike } from '@/domain/market-data/client/types'

export function createChinaEquityTools(client: EquityClientLike) {
  return {
    chinaEquityGetHistory: tool({
      description: `Get historical OHLCV price data for China A-share stocks.

Returns daily/weekly/monthly candlestick data (date, open, high, low, close, volume, change_pct).
Data is sourced from AkShare and covers Shanghai (SH) and Shenzhen (SZ) listed stocks.

Symbol format: 600519.SH (Shanghai) or 000001.SZ (Shenzhen).
If unsure about the symbol, use marketSearchForResearch to find it.`,
      inputSchema: z.object({
        symbol: z.string().describe('A-share symbol, e.g. "600519.SH" (Guizhou Moutai) or "000001.SZ" (Ping An Bank)'),
        start_date: z.string().optional().describe('Start date in YYYY-MM-DD format, e.g. "2024-01-01"'),
        end_date: z.string().optional().describe('End date in YYYY-MM-DD format, e.g. "2024-12-31"'),
        period: z.enum(['daily', 'weekly', 'monthly']).optional().describe('Candle period (default: daily)'),
        adjust: z.enum(['qfq', 'hfq', '']).optional().describe('Price adjustment: qfq=forward (default), hfq=backward, empty=no adjust'),
      }),
      execute: async ({ symbol, start_date, end_date, period, adjust }) => {
        const params: Record<string, unknown> = { symbol }
        if (start_date) params.start_date = start_date
        if (end_date) params.end_date = end_date
        if (period) params.period = period
        if (adjust !== undefined) params.adjust = adjust
        return await client.getHistorical(params)
      },
    }),

    chinaEquityGetProfile: tool({
      description: `Get basic information for a China A-share stock.

Returns company name, listing exchange, listing date, total shares, circulating shares, industry, and region.
Data is sourced from AkShare.

Symbol format: 600519.SH (Shanghai) or 000001.SZ (Shenzhen).
If unsure about the symbol, use marketSearchForResearch to find it.`,
      inputSchema: z.object({
        symbol: z.string().describe('A-share symbol, e.g. "600519.SH" or "000001.SZ"'),
      }),
      execute: async ({ symbol }) => {
        const [profile, metrics] = await Promise.all([
          client.getProfile({ symbol }).catch(() => []),
          client.getKeyMetrics({ symbol }).catch(() => []),
        ])
        return { profile: profile[0] ?? null, metrics: metrics[0] ?? null }
      },
    }),

    chinaEquityDiscover: tool({
      description: `Get China A-share market movers: top gainers, losers, or most active stocks by turnover.

Returns real-time snapshot data including price, change_pct, volume, market_cap, pe_ratio, pb_ratio.
Data is sourced from AkShare (East Money real-time quotes).

Use type:
- "gainers" — today's biggest percentage gainers (Top 20)
- "losers"  — today's biggest percentage losers (Top 20)
- "active"  — most actively traded by turnover amount (Top 20)`,
      inputSchema: z.object({
        type: z.enum(['gainers', 'losers', 'active']).describe('Discovery type'),
      }),
      execute: async ({ type }) => {
        switch (type) {
          case 'gainers': return await client.getGainers()
          case 'losers':  return await client.getLosers()
          case 'active':  return await client.getActive()
        }
      },
    }),

    chinaEquityGetFinancials: tool({
      description: `Get financial statements for China A-share stocks.

Returns income statement, balance sheet, or cash flow statement depending on the "type" parameter.
Each entry is one fiscal period (quarterly or annual).
Data is sourced from AkShare (East Money financial reports).

Symbol format: 600519.SH (Shanghai) or 000001.SZ (Shenzhen).
If unsure about the symbol, use marketSearchForResearch to find it.`,
      inputSchema: z.object({
        symbol: z.string().describe('A-share symbol, e.g. "600519.SH" (Guizhou Moutai) or "000001.SZ" (Ping An Bank)'),
        type: z.enum(['income', 'balance', 'cash']).describe('Statement type: "income" for income statement, "balance" for balance sheet, "cash" for cash flow'),
        limit: z.number().int().positive().optional().describe('Number of periods to return (default: 5)'),
      }),
      execute: async ({ symbol, type, limit }) => {
        const params: Record<string, unknown> = { symbol }
        if (limit) params.limit = limit

        switch (type) {
          case 'income':
            return await client.getIncomeStatement(params)
          case 'balance':
            return await client.getBalanceSheet(params)
          case 'cash':
            return await client.getCashFlow(params)
        }
      },
    }),

    chinaEquityGetRatios: tool({
      description: `Get financial ratios for China A-share stocks.

Returns profitability ratios (ROE, gross margin, operating margin, net margin),
liquidity ratios (current ratio), leverage ratios (debt to assets),
and efficiency ratios (asset turnover).
Ratios are calculated from income statement and balance sheet data.

Symbol format: 600519.SH (Shanghai) or 000001.SZ (Shenzhen).
If unsure about the symbol, use marketSearchForResearch to find it.`,
      inputSchema: z.object({
        symbol: z.string().describe('A-share symbol, e.g. "600519.SH" or "000001.SZ"'),
        limit: z.number().int().positive().optional().describe('Number of periods to return (default: 5)'),
      }),
      execute: async ({ symbol, limit }) => {
        const params: Record<string, unknown> = { symbol }
        if (limit) params.limit = limit
        return await client.getFinancialRatios(params)
      },
    }),

    chinaEquityGetEarningsCalendar: tool({
      description: `Get earnings calendar for China A-share stocks.

Returns report period (report_name), report date (report_date), and actual disclosure date (actual_date).
Shows recent earnings report release dates, sorted by most recent first.
Data is sourced from AkShare (East Money financial reports).

Symbol format: 600519.SH (Shanghai) or 000001.SZ (Shenzhen).
If unsure about the symbol, use marketSearchForResearch to find it.`,
      inputSchema: z.object({
        symbol: z.string().describe('A-share symbol, e.g. "600519.SH" or "000001.SZ"'),
        period: z.string().optional().describe('Filter by report period, e.g. "2024年报", "2025一季报"'),
        limit: z.number().int().positive().optional().describe('Number of entries to return (default: 10)'),
      }),
      execute: async ({ symbol, period, limit }) => {
        const params: Record<string, unknown> = { symbol }
        if (period) params.period = period
        if (limit) params.limit = limit
        return await client.getCalendarEarnings(params)
      },
    }),
  }
}
