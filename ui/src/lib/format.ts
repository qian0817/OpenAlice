/**
 * Money / number formatting helpers shared across trading + portfolio surfaces.
 *
 * UTADetailPage, SnapshotDetail, and the new UTA cards all need the same
 * "$1,234.56" / "+$1,234.56" / native-currency-symbol behaviour. Keep the
 * canonical implementations here so a stylistic change (decimal places,
 * compact notation) is one edit, not ten.
 *
 * Note: these accept either `number` or numeric `string` (the trading API
 * serializes `Decimal` as string to avoid IEEE-754 rounding artifacts in
 * money math). NaN / non-finite inputs render as "—" — loud, never silent.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', HKD: 'HK$', EUR: '€', GBP: '£', JPY: '¥',
  CNY: '¥', CNH: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ',
  SGD: 'S$', KRW: '₩', INR: '₹', TWD: 'NT$', BRL: 'R$',
}

export function currencySymbol(currency?: string): string {
  if (!currency) return '$'
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `
}

function toFiniteNumber(input: number | string | undefined | null): number | null {
  if (input == null) return null
  const n = typeof input === 'number' ? input : Number(input)
  return Number.isFinite(n) ? n : null
}

/** "$1,234.56" / "HK$1,234.56" / "—" for NaN. */
export function fmt(input: number | string | undefined | null, currency?: string): string {
  const n = toFiniteNumber(input)
  if (n == null) return '—'
  const sym = currencySymbol(currency)
  return `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "+$1,234.56" / "-$1,234.56". `0` renders as "+$0.00" (intentional —
 *  matches the rest of the stack; a "flat" badge is the caller's job). */
export function fmtPnl(input: number | string | undefined | null, currency?: string): string {
  const n = toFiniteNumber(input)
  if (n == null) return '—'
  const sym = currencySymbol(currency)
  const sign = n >= 0 ? '+' : '-'
  const abs = Math.abs(n)
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "1,234.56" or "0.0123" for sub-unit values; for share/contract counts. */
export function fmtNum(input: number | string | undefined | null): string {
  const n = toFiniteNumber(input)
  if (n == null) return '—'
  return Math.abs(n) >= 1
    ? n.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : n.toPrecision(4)
}

/** "+1.92%" / "-0.34%". `0` renders as "+0.00%". */
export function fmtPctSigned(pct: number | undefined | null, digits = 2): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}%`
}

// Re-export the Market workbench's helpers from one place so callers only
// need to import from `lib/format`. The split was historical (market/format
// predates this lib); consolidating now.
export { fmtNumber, fmtInt, fmtMoneyShort, fmtPercent } from '../components/market/format'
