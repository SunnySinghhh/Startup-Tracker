/**
 * Funding progression matrix: companies down the side, stages across the top,
 * dollars raised in the cells.
 *
 * An empty cell means the company has no Form D filing we could place at that
 * stage — the absence is the information, so cells are left genuinely blank
 * rather than filled with a zero that would read as "raised nothing".
 *
 * Amounts come from each filing's own XML (`totalAmountSold`), not the SEC
 * full-text index, which carries no amounts. Stage labels are *inferred* from
 * amount bands and filing order — Form D never states a round name — and every
 * column header says so.
 */

import { useMemo, useState } from 'react'
import type { FundingMatrix as MatrixData, FundingRow } from '../data/types'
import { formatDate, initials } from '../lib/format'

/** Compact money for a dense grid: $1.2M, $340M, $8.6B. */
function cellMoney(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`
  if (amount >= 1_000_000) return `$${Math.round(amount / 1_000_000)}M`
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`
  return `$${Math.round(amount)}`
}

type SortKey = 'total' | 'company' | 'recent'

export function FundingMatrix({
  matrix,
  loading,
  onSelect,
}: {
  matrix: MatrixData | null
  loading: boolean
  onSelect: (companyId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('total')

  const rows = useMemo(() => {
    if (!matrix) return []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? matrix.rows.filter(
          (r) =>
            r.company.toLowerCase().includes(q) ||
            (r.sector ?? '').toLowerCase().includes(q),
        )
      : matrix.rows
    const sorted = [...filtered]
    if (sort === 'company') sorted.sort((a, b) => a.company.localeCompare(b.company))
    else if (sort === 'recent')
      sorted.sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
    else sorted.sort((a, b) => b.total - a.total)
    return sorted
  }, [matrix, query, sort])

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    )
  }

  const stages = matrix?.stages ?? []
  // One shared scale across the whole grid, so a cell's fill is comparable
  // between rows rather than only within one.
  const peak = Math.max(1, ...rows.flatMap((r) => Object.values(r.stages).map((c) => c.amount)))

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Funding progression</h1>
          <p className="page__lede">
            Dollars raised at each stage, from SEC Form D filings. A blank cell means no filing
            we could place at that stage — not a raise of zero.
          </p>
        </div>
      </header>

      {rows.length === 0 && !query ? (
        <EmptyMatrix />
      ) : (
        <>
          <div className="controls">
            <input
              className="input"
              type="search"
              placeholder="Filter companies…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter funding table"
              style={{ maxWidth: 260 }}
            />
            <select
              className="select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort funding table"
              style={{ maxWidth: 190 }}
            >
              <option value="total">Most raised</option>
              <option value="recent">Most recent filing</option>
              <option value="company">Company name</option>
            </select>
            <span className="controls__count">
              {rows.length} compan{rows.length === 1 ? 'y' : 'ies'} with filings
            </span>
          </div>

          <div className="matrix-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="matrix__corner">Company</th>
                  {stages.map((stage) => (
                    <th key={stage} className="matrix__stage">
                      {stage}
                      <span className="matrix__inferred" title="Inferred from amount and filing order">
                        inferred
                      </span>
                    </th>
                  ))}
                  <th className="matrix__total-head">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row key={row.id} row={row} stages={stages} peak={peak} onSelect={onSelect} />
                ))}
              </tbody>
            </table>
          </div>

          <p className="footnote">
            Amounts are <code>totalAmountSold</code> from each filing, summed per stage. Stage
            labels are inferred — Form D never states a round name — so treat them as approximate.
            Coverage grows over time: the scheduled job checks a rotating slice of companies
            against EDGAR each run.
          </p>
        </>
      )}
    </div>
  )
}

function Row({
  row,
  stages,
  peak,
  onSelect,
}: {
  row: FundingRow
  stages: string[]
  peak: number
  onSelect: (id: string) => void
}) {
  return (
    <tr className="matrix__row" onClick={() => onSelect(row.id)}>
      <th scope="row" className="matrix__company">
        {row.logo ? (
          <img src={row.logo} alt="" className="matrix__logo" loading="lazy" />
        ) : (
          <span className="matrix__logo matrix__logo--fallback">{initials(row.company)}</span>
        )}
        <span className="matrix__name">{row.company}</span>
        <span className="matrix__batch">{row.batch ?? 'Non-YC'}</span>
      </th>

      {stages.map((stage) => {
        const cell = row.stages[stage]
        if (!cell) {
          return (
            <td key={stage} className="matrix__cell matrix__cell--empty">
              <span className="sr-only">no filing at this stage</span>
            </td>
          )
        }
        // Log scale: raises span three orders of magnitude, so a linear fill
        // would leave everything below the largest round invisible. The range
        // is kept shallow so the small text above it stays legible.
        const intensity = Math.log1p(cell.amount) / Math.log1p(peak)
        return (
          <td key={stage} className="matrix__cell">
            <span
              className="matrix__fill"
              style={{ opacity: 0.12 + intensity * 0.34 }}
              aria-hidden="true"
            />
            <span className="matrix__amount">{cellMoney(cell.amount)}</span>
            <span className="matrix__meta">
              {cell.date ? formatDate(cell.date).slice(0, 6) : ''}
              {cell.filings > 1 ? ` · ${cell.filings} filings` : ''}
            </span>
          </td>
        )
      })}

      <td className="matrix__total">{cellMoney(row.total)}</td>
    </tr>
  )
}

function EmptyMatrix() {
  return (
    <div className="empty">
      <div className="empty__title">No funding filings collected yet</div>
      <p className="empty__body">
        SEC lookups run per company, so the scheduled job checks a rotating slice each day rather
        than all of them at once. This table fills in as that coverage grows.
      </p>
    </div>
  )
}
