/**
 * Company vs. cohort.
 *
 * "+32% headcount" is a number. "+32%, against a cohort median of +4%, 91st
 * percentile" is a judgment. This is the cheapest way to turn the former into
 * the latter, and it uses only data already held.
 *
 * The cohort actually used is named, because it varies: a company in a large
 * sector is ranked against its sector and stage, one in a thin sector against
 * the sector alone. Hiding that would make the percentile look more precise
 * than it is.
 */

import type { Company, PeerMetric } from '../data/types'
import { compactMoney, plain } from '../lib/format'

const ROWS: { key: 'growth' | 'headcount' | 'raised' | 'momentum'; label: string }[] = [
  { key: 'growth', label: 'Headcount growth' },
  { key: 'headcount', label: 'Employees' },
  { key: 'raised', label: 'Total raised' },
  { key: 'momentum', label: 'Momentum' },
]

function render(key: string, value: number): string {
  if (key === 'growth') return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`
  if (key === 'raised') return compactMoney(value)
  if (key === 'momentum') return value.toFixed(0)
  return plain(Math.round(value))
}

/** Ordinal suffix — "91st", not "91th". */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}

function toneFor(percentile: number): string {
  if (percentile >= 90) return 'hot'
  if (percentile >= 70) return 'good'
  if (percentile <= 25) return 'warn'
  return 'muted'
}

export function PeerContext({ company }: { company: Company }) {
  const peers = company.peers
  if (!peers) return null

  const present = ROWS.filter((r) => peers.metrics[r.key])
  if (present.length === 0) return null

  return (
    <div>
      <div className="peer-head">
        <span className="peer-head__cohort">{peers.cohort}</span>
        <span className="peer-head__n">{plain(peers.cohortSize)} companies</span>
      </div>

      <table className="peer-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th style={{ textAlign: 'right' }}>This company</th>
            <th style={{ textAlign: 'right' }}>Cohort median</th>
            <th style={{ textAlign: 'right' }}>Percentile</th>
          </tr>
        </thead>
        <tbody>
          {present.map(({ key, label }) => {
            const m = peers.metrics[key] as PeerMetric
            return (
              <tr key={key}>
                <td>{label}</td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {render(key, m.value)}
                </td>
                <td className="num cell--dim" style={{ textAlign: 'right' }}>
                  {render(key, m.median)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`pct pct--${toneFor(m.percentile)}`} title={`Ranked against ${m.n} companies with this metric`}>
                    {ordinal(m.percentile)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="footnote">
        Percentiles rank only companies that have the metric — a company with no
        headcount reading isn&apos;t counted as zero.
      </p>
    </div>
  )
}
