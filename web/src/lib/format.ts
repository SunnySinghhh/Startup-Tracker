/** Display formatting. Kept in one place so numbers read consistently. */

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const PLAIN = new Intl.NumberFormat('en-US')

export const compact = (n: number): string => COMPACT.format(n)
export const plain = (n: number): string => PLAIN.format(n)

export function percent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '' : ''}${value.toFixed(digits)}%`
}

export function signedPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function money(amount?: number | null, currency = 'USD'): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const symbol = currency === 'USD' ? '$' : ''
  return `${symbol}${COMPACT.format(amount)}`
}

/** Absolute date, always unambiguous: "12 Mar 2026". */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Relative age for recency cues, paired with the absolute date, never alone. */
export function relativeDays(iso?: string | null): string {
  if (!iso) return ''
  const then = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days < 0) return 'upcoming'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/** Initials for the logo fallback — never more than two characters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase()
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase()
}

/** YC batch codes sort chronologically, not alphabetically. */
export function batchSortKey(batch?: string): number {
  if (!batch) return -1
  const match = /(Winter|Spring|Summer|Fall)\s+(\d{4})/i.exec(batch)
  if (!match) return -1
  const season = { winter: 0, spring: 1, summer: 2, fall: 3 }[match[1]!.toLowerCase()] ?? 0
  return Number(match[2]) * 10 + season
}
