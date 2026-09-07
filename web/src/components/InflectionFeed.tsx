/**
 * The inflection feed: moments where something changed, newest first.
 *
 * A news feed tells you what was published. This tells you what moved, and
 * shows the evidence underneath each claim so a reader can check it rather
 * than take it on faith. That evidence chain is the point — a headline like
 * "hiring accelerating" is worthless if you can't see the numbers behind it.
 *
 * Only inflection types this pipeline can evidence appear. Job-posting bursts,
 * executive hires and founder moves would all belong here, but need people or
 * jobs data no free, terms-compliant source provides.
 */

import { useMemo, useState } from 'react'
import type { Inflection } from '../data/types'
import { formatDate, initials, relativeDays } from '../lib/format'

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'headcount', label: 'Headcount' },
  { key: 'funding', label: 'Funding' },
  { key: 'milestone', label: 'Milestones' },
  { key: 'hiring', label: 'Hiring' },
] as const

const GLYPH: Record<string, string> = {
  headcount: '▲',
  funding: '◆',
  milestone: '●',
  hiring: '◇',
}

export function InflectionFeed({
  inflections,
  loading,
  onSelect,
  limit,
  compact = false,
}: {
  inflections: Inflection[]
  loading?: boolean
  onSelect: (companyId: string) => void
  limit?: number
  compact?: boolean
}) {
  const [type, setType] = useState<string>('all')

  const rows = useMemo(() => {
    const filtered = type === 'all' ? inflections : inflections.filter((i) => i.type === type)
    return limit ? filtered.slice(0, limit) : filtered
  }, [inflections, type, limit])

  if (loading) return <div className="skeleton" style={{ height: 160 }} />

  if (inflections.length === 0) {
    return (
      <p className="muted-note">
        No inflections detected in the last 120 days. This is a real reading, not a gap — most
        companies hold steady in any given quarter.
      </p>
    )
  }

  return (
    <div>
      {!compact && (
        <div className="rangebar" role="group" aria-label="Inflection type" style={{ marginBottom: 'var(--space-4)' }}>
          {TYPES.map((t) => (
            <button
              key={t.key}
              className="rangebar__btn"
              aria-pressed={type === t.key}
              onClick={() => setType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <ol className="inflections">
        {rows.map((item) => (
          <li key={item.id} className="inflection">
            <span className={`inflection__glyph inflection__glyph--${item.direction}`} aria-hidden="true">
              {GLYPH[item.type] ?? '·'}
            </span>
            <div className="inflection__body">
              <div className="inflection__head">
                <button className="inflection__company" onClick={() => onSelect(item.companyId)}>
                  {item.company}
                </button>
                <span className={`inflection__headline is-${item.direction}`}>{item.headline}</span>
                <span className="inflection__date" title={formatDate(item.date)}>
                  {relativeDays(item.date)}
                </span>
              </div>
              {!compact && (
                <ul className="inflection__evidence">
                  {item.evidence.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
            {!compact && item.logo && (
              <img className="inflection__logo" src={item.logo} alt="" loading="lazy" />
            )}
            {!compact && !item.logo && (
              <span className="inflection__logo inflection__logo--fallback">
                {initials(item.company)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
