/**
 * Momentum signals and the score readout.
 *
 * Signals are deliberately sparse — see `signalsFor`, which enforces the
 * thresholds. A badge on every row would carry no information.
 */

import type { Company } from '../data/types'
import { momentumBand, signalsFor, stageBadge } from '../lib/signals'

export function StageBadge({ company }: { company: Company }) {
  const badge = stageBadge(company)
  if (!badge) return <span className="badge badge--none" title="No SEC filing on record">—</span>
  return (
    <span
      className={`badge badge--${badge.tone}`}
      title={badge.inferred ? 'Stage inferred from filing amount and order' : undefined}
    >
      {badge.label}
      {badge.inferred && <span className="badge__caveat">?</span>}
    </span>
  )
}

export function SignalTags({ company, max = 2 }: { company: Company; max?: number }) {
  const signals = signalsFor(company, max)
  if (signals.length === 0) return null
  return (
    <span className="signals">
      {signals.map((s) => (
        <span key={s.label} className={`signal-tag signal-tag--${s.tone}`} title={s.title}>
          <span aria-hidden="true">{s.icon}</span> {s.label}
        </span>
      ))}
    </span>
  )
}

const METHOD = [
  ['Headcount growth (90d)', '0.35'],
  ['Press activity (30d)', '0.25'],
  ['Actively hiring', '0.15'],
  ['Funding recency', '0.15'],
  ['GitHub activity', '0.10'],
]

export function MomentumScore({ company, size = 'md' }: { company: Company; size?: 'md' | 'lg' }) {
  const score = company.momentum?.score ?? 0
  const coverage = company.momentum?.coverage ?? 0
  const band = momentumBand(score)

  const tip =
    `Momentum ${score.toFixed(1)}/100 — ${band.label}\n\n` +
    METHOD.map(([name, weight]) => `${name}  ×${weight}`).join('\n') +
    `\n\n${Math.round(coverage * 100)}% of the weighting is backed by measured data ` +
    `for this company. Unmeasured components contribute nothing rather than being guessed, ` +
    `so a low score can mean "quiet" or "not yet measured".`

  return (
    <span className={`mscore mscore--${size} mscore--${band.tone}`} title={tip}>
      <span className="mscore__value">{score > 0 ? score.toFixed(0) : '—'}</span>
      {size === 'lg' && <span className="mscore__band">{band.label}</span>}
    </span>
  )
}
