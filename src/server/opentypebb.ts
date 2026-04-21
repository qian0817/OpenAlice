/**
 * OpenTypeBB Mount Helper
 *
 * Merges opentypebb's REST router into an existing Hono app so market-data
 * endpoints live on the same port as the rest of the Alice web API.
 *
 * No standalone server: opentypebb is first-class inside Alice. Anyone who
 * wants it as a detached process can run `packages/opentypebb` directly.
 */

import type { Hono } from 'hono'
import {
  loadAllRouters,
  buildWidgetsJson,
  createRegistry,
  type QueryExecutor,
} from '@traderalice/opentypebb'

export interface DefaultProviders {
  /** Also used for etf/index/derivatives, matching main.ts client construction. */
  equity: string
  crypto: string
  currency: string
  commodity: string
}

export interface MountOpenTypeBBOptions {
  /** URL prefix to mount routes under (e.g. `/api/market-data-v1`). */
  basePath: string
  /**
   * Credentials injected into every request that does not supply its own
   * `X-OpenBB-Credentials` header — typically the server-side provider keys.
   */
  defaultCredentials: Record<string, string>
  /**
   * Per-asset-class default provider, used when the request omits `?provider=`.
   * The asset class is the first path segment after `basePath`.
   */
  defaultProviders: DefaultProviders
}

function makeProviderResolver(
  basePath: string,
  providers: DefaultProviders,
): (path: string) => string | undefined {
  return (path: string) => {
    const sub = path.slice(basePath.length).replace(/^\/+/, '').split('/')[0]
    switch (sub) {
      case 'equity':
      case 'etf':
      case 'index':
      case 'derivatives':
        return providers.equity
      case 'crypto':
        return providers.crypto
      case 'currency':
        return providers.currency
      case 'commodity':
        return providers.commodity
      default:
        return undefined
    }
  }
}

export function mountOpenTypeBB(
  app: Hono,
  executor: QueryExecutor,
  opts: MountOpenTypeBBOptions,
): void {
  const rootRouter = loadAllRouters()
  const registry = createRegistry()

  const resolveProvider = makeProviderResolver(opts.basePath, opts.defaultProviders)
  rootRouter.mountToHono(app, executor, opts.basePath, opts.defaultCredentials, resolveProvider)

  const widgetsJson = buildWidgetsJson(rootRouter, registry)
  app.get(`${opts.basePath}/widgets.json`, (c) => c.json(widgetsJson))

  console.log(
    `[opentypebb] mounted on ${opts.basePath} (${Object.keys(widgetsJson).length} widgets)`,
  )
}
