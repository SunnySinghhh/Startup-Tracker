/**
 * Compact "trending this week" strip.
 *
 * Kept to one line per company on purpose — the brief asks for compact, and a
 * row of large cards would push the table (the page's real subject) below the
 * fold. Each entry states *why* it is trending rather than just ranking.
 */

import type { Company } from '../data/types'
import { compactMoney, plain, relativeDays } from '../lib/format'
import { WINDOW_LABEL, headlineGrowth } from '../lib/signals'

interface Trend {
  company: Company
  reason: string
  tone: 'hot' | 'good'
  rank: number
}

const RECENT_FUNDING_DAYS = 90

/**
 * Two kinds of "unusual activity": a meaningful headcount jump, or a fresh
 * filing. Small-base moves are excluded — 2 → 5 employees is not a trend.
 */
function trending(companies: Company[], limit: number): Trend[] {
  const out: Trend[] = []

  for (const c of companies) {
    const growth = headlineGrowth(c.growth)
    if (growth && !growth.window.stale) {
      const w = growth.window
      if (w.from >= 12 && w.delta >= 5 && w.pct >= 25) {
        out.push({
          company: c,
          reason: `↑ ${Math.round(w.pct)}% headcount · ${WINDOW_LABEL[growth.key]}`,
          tone: 'hot',
          rank: w.pct + w.delta,
        })
        continue
      }
    }

    const date = c.lastRound?.date
    if (date) {
      const days = (Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000
      if (days <= RECENT_FUNDING_DAYS && c.lastRound?.amount) {
        out.push({
          company: c,
          reason: `${compactMoney(c.lastRound.amount)} ${c.lastRound.stage ?? 'round'} · ${relativeDays(date)}`,
          tone: 'good',
          rank: 40 + Math.log10(c.lastRound.amount),
        })
      }
    }
  }

  out.sort((a, b) => b.rank - a.rank)
  return out.slice(0, limit)
}

export function TrendingStartups({
  companies,
  onSelect,
  limit = 5,
}: {
  companies: Company[]
  onSelect: (id: string) => void
  limit?: number
}) {
  const rows = trending(companies, limit)
  if (rows.length === 0) return null

  return (
    <section className="trending">
      <div className="trending__head">
        <h2 className="trending__title">Trending</h2>
        <span className="trending__note">unusual activity in the last 90 days</span>
      </div>
      <ol className="trending__list">
        {rows.map((t, i) => (
          <li key={t.company.id}>
            <button className="trending__row" onClick={() => onSelect(t.company.id)}>
              <span className="trending__rank">{i + 1}</span>
              <span className="trending__name">{t.company.name}</span>
              <span className={`trending__reason trending__reason--${t.tone}`}>{t.reason}</span>
              <span className="trending__size num">
                {t.company.headcount != null ? `${plain(t.company.headcount)} emp` : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
