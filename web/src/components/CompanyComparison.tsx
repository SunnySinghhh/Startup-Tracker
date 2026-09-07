/**
 * Side-by-side comparison of 2–4 companies.
 *
 * Laid out as a metric-per-row matrix rather than one card per company, so the
 * eye travels along a row to compare like with like. The best value in each
 * numeric row is marked, but only when the metric is actually comparable — a
 * "best" badge on a row where two of three companies have no data would be
 * misleading.
 */

import type { Company } from '../data/types'
import { compactMoney, formatDate, plain, relativeDays } from '../lib/format'
import { WINDOW_LABEL, headlineGrowth } from '../lib/signals'
import { MomentumScore, StageBadge } from './MomentumBadge'

interface Row {
  label: string
  values: (string | null)[]
  /** Numeric values used to pick a winner; null where not comparable. */
  compare?: (number | null)[]
  higherIsBetter?: boolean
}

export function CompanyComparison({
  companies,
  onRemove,
  onSelect,
}: {
  companies: Company[]
  onRemove: (id: string) => void
  onSelect: (id: string) => void
}) {
  if (companies.length === 0) {
    return (
      <div className="empty">
        <div className="empty__title">Nothing to compare yet</div>
        <p className="empty__body">
          Pick companies from the directory — press <kbd>c</kbd> on a row, or use{' '}
          <strong>+ Compare</strong> on a profile. Up to four at once.
        </p>
      </div>
    )
  }

  const growths = companies.map((c) => headlineGrowth(c.growth))

  const rows: Row[] = [
    {
      label: 'Industry',
      values: companies.map((c) => c.sector ?? null),
    },
    {
      label: 'Total raised',
      values: companies.map((c) => (c.totalRaised ? compactMoney(c.totalRaised) : null)),
      compare: companies.map((c) => c.totalRaised ?? null),
      higherIsBetter: true,
    },
    {
      label: 'Employees',
      values: companies.map((c) => (c.headcount != null ? plain(c.headcount) : null)),
      compare: companies.map((c) => c.headcount ?? null),
      higherIsBetter: true,
    },
    {
      label: 'Headcount growth',
      values: companies.map((_company, i) => {
        const g = growths[i]
        return g ? `${g.window.pct >= 0 ? '+' : ''}${g.window.pct.toFixed(0)}% (${WINDOW_LABEL[g.key]})` : null
      }),
      compare: companies.map((_, i) => growths[i]?.window.pct ?? null),
      higherIsBetter: true,
    },
    {
      label: 'Momentum',
      values: companies.map((c) => (c.momentum?.score ? c.momentum.score.toFixed(0) : null)),
      compare: companies.map((c) => c.momentum?.score ?? null),
      higherIsBetter: true,
    },
    {
      label: 'Last round',
      values: companies.map((c) => (c.lastRound?.date ? relativeDays(c.lastRound.date) : null)),
    },
    {
      label: 'Location',
      values: companies.map((c) => c.country ?? null),
    },
    {
      label: 'Listed',
      values: companies.map((c) => (c.founded ? formatDate(c.founded).slice(-4) : null)),
    },
    {
      label: 'Batch',
      values: companies.map((c) => c.batch ?? (c.origin === 'custom' ? 'Not YC' : null)),
    },
  ]

  const columns = `160px repeat(${companies.length}, minmax(130px, 1fr))`

  return (
    <div className="cmp">
      <div className="cmp__grid" style={{ gridTemplateColumns: columns }}>
        <div className="cmp__corner" />
        {companies.map((c) => (
          <div className="cmp__head" key={c.id}>
            <button className="cmp__name" onClick={() => onSelect(c.id)}>
              {c.name}
            </button>
            <div className="cmp__badges">
              <StageBadge company={c} />
              <MomentumScore company={c} />
            </div>
            <button className="cmp__remove" onClick={() => onRemove(c.id)} aria-label={`Remove ${c.name}`}>
              ✕
            </button>
          </div>
        ))}

        {rows.map((row) => {
          // A winner is only meaningful when at least two companies have the
          // metric; otherwise "best" just means "only one we measured".
          const present = (row.compare ?? []).filter((v) => v != null) as number[]
          const best =
            row.compare && present.length >= 2
              ? row.higherIsBetter
                ? Math.max(...present)
                : Math.min(...present)
              : null

          return (
            <div className="cmp__row" key={row.label} style={{ display: 'contents' }}>
              <div className="cmp__label">{row.label}</div>
              {row.values.map((value, i) => {
                const numeric = row.compare?.[i] ?? null
                const isBest = best != null && numeric != null && numeric === best
                return (
                  <div
                    key={`${row.label}-${i}`}
                    className={`cmp__cell${value == null ? ' cmp__cell--absent' : ''}${
                      isBest ? ' cmp__cell--best' : ''
                    }`}
                  >
                    {value ?? '—'}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
