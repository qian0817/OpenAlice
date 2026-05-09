/** Shared formatters for the Market workbench. Kept tiny — no i18n / locale picking. */

export function fmtNumber(n: unknown, digits = 2): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtInt(n: unknown): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

/** Scale large absolute values to B / M / K with one decimal. */
export function fmtMoneyShort(n: unknown): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`
  return `${sign}${abs.toFixed(2)}`
}

export function fmtPercent(n: unknown, digits = 2): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}
