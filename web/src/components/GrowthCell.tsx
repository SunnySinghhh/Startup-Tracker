/** Headcount, its growth, and an inline sparkline — the row's momentum story. */

import type { Company } from '../data/types'
import { plain } from '../lib/format'
import { WINDOW_LABEL, headlineGrowth } from '../lib/signals'
import { Sparkline } from './LineChart'
import { TrajectoryBadge } from './Trajectory'

export function GrowthCell({ company }: { company: Company }) {
  const growth = headlineGrowth(company.growth)
  const headcount = company.headcount

  if (headcount == null) {
    return <span className="growth growth--absent">—</span>
  }

  return (
    <span className="growth">
      <span className="growth__count num">{plain(headcount)}</span>
      {growth ? (
        <span
          className={`growth__pct ${growth.window.pct >= 0 ? 'is-up' : 'is-down'}`}
          title={
            `${growth.window.from} → ${growth.window.to} over ${WINDOW_LABEL[growth.key]}` +
            (growth.window.stale
              ? `\nBased on a reading from ${growth.window.anchorDate}, carried forward.`
              : '')
          }
        >
          {growth.window.pct >= 0 ? '↑' : '↓'}
          {Math.abs(Math.round(growth.window.pct))}%
          <span className="growth__window">{WINDOW_LABEL[growth.key]}</span>
        </span>
      ) : (
        <span className="growth__pct growth__pct--absent" title="Not enough history yet">
          —
        </span>
      )}
      <TrajectoryBadge trajectory={company.trajectory} />
      {company.spark && company.spark.length > 1 && (
        <Sparkline
          points={company.spark}
          width={54}
          height={16}
          color={growth && growth.window.pct < 0 ? 'var(--critical)' : 'var(--good)'}
        />
      )}
    </span>
  )
}
