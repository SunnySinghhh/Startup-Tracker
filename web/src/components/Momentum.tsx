/**
 * Momentum score display: a stacked composition bar plus a directly-labelled
 * legend.
 *
 * Two constraints shaped this component.
 *
 * First, the score must never be a black box. The bar shows each component's
 * contribution to the total, and the legend states the raw value and the weight
 * behind it, so "why is this 42?" is answerable on sight.
 *
 * Second, three of the five series colours sit below 3:1 contrast on the light
 * surface. The palette validator flags that as a WARN requiring relief, so every
 * segment carries a visible text label in the legend — identity is never
 * communicated by colour alone.
 */

import type { Momentum as MomentumData } from '../data/types'

/** Render order matches the order the palette was validated in — adjacent
    pairs were checked in exactly this sequence. Do not reorder casually. */
const COMPONENTS = [
  { key: 'headcountGrowth', label: 'Headcount growth', color: 'var(--series-1)', weight: 0.35 },
  { key: 'press', label: 'Press activity', color: 'var(--series-2)', weight: 0.25 },
  { key: 'hiring', label: 'Actively hiring', color: 'var(--series-3)', weight: 0.15 },
  { key: 'fundingRecency', label: 'Funding recency', color: 'var(--series-4)', weight: 0.15 },
  { key: 'github', label: 'GitHub activity', color: 'var(--series-5)', weight: 0.1 },
] as const

const CONFIDENCE_COPY: Record<string, string> = {
  none: 'No signals measured yet',
  low: 'Thin evidence — few signals so far',
  medium: 'Moderate evidence',
  high: 'Well-evidenced',
}

export function MomentumBar({
  momentum,
  height = 10,
  showEmptyTrack = true,
}: {
  momentum?: MomentumData
  height?: number
  /** In dense table rows an empty track on thousands of unscored companies is
      pure noise, so the table opts out and lets the "—" carry the meaning. */
  showEmptyTrack?: boolean
}) {
  const components = momentum?.components ?? {}
  const segments = COMPONENTS.map((c) => ({
    ...c,
    // Contribution to the 0-100 total, which is what the bar encodes.
    contribution: (components[c.key] ?? 0) * c.weight * 100,
  })).filter((s) => s.contribution > 0)

  if (segments.length === 0) {
    if (!showEmptyTrack) return null
    return <div className="mbar" style={{ height }} aria-label="No momentum signals recorded" />
  }

  return (
    <div className="mbar" style={{ height }} role="img" aria-label={`Momentum ${momentum?.score ?? 0} of 100`}>
      {segments.map((s) => (
        <div
          key={s.key}
          className="mbar__seg"
          style={{ width: `${s.contribution}%`, background: s.color }}
          title={`${s.label}: ${s.contribution.toFixed(1)} points`}
        />
      ))}
      {/* Remaining unearned score, shown as empty track. */}
      <div style={{ flex: 1 }} />
    </div>
  )
}

export function MomentumBreakdown({ momentum }: { momentum?: MomentumData }) {
  const score = momentum?.score ?? 0
  const components = momentum?.components ?? {}
  const confidence = momentum?.confidence ?? 'none'
  const coverage = momentum?.coverage ?? 0

  return (
    <div>
      <div className="momentum-hero">
        <span className="momentum-hero__score">{score.toFixed(1)}</span>
        <span className="momentum-hero__of">/ 100</span>
        <span style={{ flex: 1 }} />
        <span className={`chip ${confidence === 'high' ? 'chip--good' : 'chip--muted'}`}>
          {CONFIDENCE_COPY[confidence] ?? confidence}
        </span>
      </div>

      <MomentumBar momentum={momentum} height={12} />

      <div className="mlegend">
        {COMPONENTS.map((c) => {
          const raw = components[c.key]
          const measured = raw != null
          const contribution = (raw ?? 0) * c.weight * 100

          const display = measured ? `+${contribution.toFixed(1)}` : 'not measured'

          return (
            <div className="mlegend__row" key={c.key}>
              <span
                className="mlegend__swatch"
                style={{ background: measured ? c.color : 'var(--surface-3)' }}
              />
              <span className="mlegend__name">{c.label}</span>
              <span className="mlegend__weight">×{c.weight.toFixed(2)}</span>
              <span className={`mlegend__value${measured ? '' : ' mlegend__value--absent'}`}>
                {display}
              </span>
            </div>
          )
        })}
      </div>

      <div className="notice" style={{ marginTop: 'var(--space-4)' }}>
        <div>
          <strong>{Math.round(coverage * 100)}% of the scoring weight</strong> is backed by measured
          data for this company. Unmeasured components contribute nothing rather than being guessed,
          so a low score can mean "quiet" or "not yet observed" — the breakdown above tells you which.
        </div>
      </div>
    </div>
  )
}
