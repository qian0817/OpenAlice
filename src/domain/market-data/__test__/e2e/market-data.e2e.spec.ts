/**
 * Market-data e2e — FRED end-to-end via webui routes.
 *
 * Reproduces the actual path users hit: webui route → bbEngine → fetcher
 * → live FRED API. bbProvider specs only cover the inner fetcher slice
 * and miss the credential-mapping / route-wiring layer where the
 * community-reported "fred 配不下来" failure modes live.
 *
 * Run: pnpm test:e2e
 * Skips if OpenAlice config has no `fred` key configured.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { getTestApp, hasProviderKey, getJson, postJson, type TestApp } from './setup.js'

let t: TestApp
beforeAll(async () => { t = await getTestApp() })

describe('market-data e2e — FRED via webui routes', () => {
  beforeEach(({ skip }) => { if (!hasProviderKey(t.config, 'fred')) skip('no fred key in config') })

  it('test-provider endpoint reports ok for valid fred key', async () => {
    // Reproduces "前端 Test Connection" button. Catches the provider
    // name mismatch (config.ts:157 used 'fred', registry has 'federal_reserve')
    // and the credential field-name mismatch in one shot.
    const key = t.config.marketData.providerKeys!.fred!
    const r = await postJson(t.app, '/api/market-data/test-provider', { provider: 'fred', key })
    expect(r.status).toBe(200)
    if (!r.data.ok) console.log('  test-provider error:', r.data.error)
    expect(r.data.ok).toBe(true)
  })

  it('fred_search via opentypebb route returns matching series', async () => {
    // Reproduces AI tool call path. Catches credential-not-flowing-through.
    const rows = await getJson(t.app, '/api/market-data-v1/economy/fred_search?provider=federal_reserve&query=GDP&limit=3')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('series_id')
    console.log(`  fred_search top hit: ${rows[0].series_id} — ${rows[0].title}`)
  })

  it('fred_series limit=5 returns latest data, not 1946', async () => {
    // Catches the asc-by-default + limit regression (returned 1946-1950 era data
    // because FRED API defaults to ascending sort).
    const rows = await getJson(t.app, '/api/market-data-v1/economy/fred_series?provider=federal_reserve&symbol=GDP&limit=5')
    expect(rows.length).toBe(5)
    const lastDate = new Date(rows[rows.length - 1].date)
    expect(lastDate.getFullYear()).toBeGreaterThanOrEqual(2025)
    console.log(`  GDP latest: ${rows[rows.length - 1].date} = ${rows[rows.length - 1].GDP}`)
  })

  it('fred_series multi-symbol returns rows with both columns populated', async () => {
    // Catches the same asc bug indirectly — with old asc default, GDP (from 1947)
    // and UNRATE (from 1948) latest-N timestamps had near-zero overlap, so
    // merged rows were almost always single-column. With desc default,
    // both series share the same recent dates.
    const rows = await getJson(t.app, '/api/market-data-v1/economy/fred_series?provider=federal_reserve&symbol=GDP,UNRATE&limit=5')
    expect(rows.length).toBeGreaterThan(0)
    const hasBoth = rows.some(r => r.GDP != null && r.UNRATE != null)
    expect(hasBoth).toBe(true)
  })

  it('fred_regional returns state-level rows', async () => {
    // Catches all three GeoFRED bugs: wrong base URL prefix, wrong param
    // name (series_group → series_id), wrong response parse path
    // (data.data → data.meta.data). Any one wrong → 0 rows or 404.
    const rows = await getJson(t.app, '/api/market-data-v1/economy/fred_regional?provider=federal_reserve&symbol=WIPCPI&date=2024-01-01')
    expect(rows.length).toBeGreaterThanOrEqual(50)  // 50 states + DC + territories
    expect(rows[0]).toHaveProperty('region')
    expect(rows[0]).toHaveProperty('value')
    const ca = rows.find(r => r.region === 'California')
    if (ca) console.log(`  California 2024 per-capita personal income: $${ca.value}`)
  })
})
