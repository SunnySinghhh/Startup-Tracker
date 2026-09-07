/**
 * Trajectory indicator: direction of travel, not position.
 *
 * Rendered nowhere when the trajectory can't be read — a company that is too
 * small or too new gets no badge at all, rather than a misleading "stable".
 * Shape carries the meaning as well as colour, so it survives a colourblind
 * reader and a greyscale print.
 */

import type { Trajectory as TrajectoryData } from '../data/types'

const SPEC: Record<
  string,
  { glyph: string; label: string; tone: string }
> = {
  accelerating: { glyph: '▲', label: 'Accelerating', tone: 'hot' },
  growing: { glyph: '↗', label: 'Growing', tone: 'good' },
  stable: { glyph: '→', label: 'Stable', tone: 'muted' },
  cooling: { glyph: '↘', label: 'Cooling', tone: 'warn' },
  contracting: { glyph: '▼', label: 'Contracting', tone: 'bad' },
}

export function TrajectoryBadge({
  trajectory,
  showLabel = false,
}: {
  trajectory?: TrajectoryData
  showLabel?: boolean
}) {
  if (!trajectory?.label) return null
  const spec = SPEC[trajectory.label]
  if (!spec) return null

  const tip =
    `${spec.label}\n` +
    `Last 90 days: ${trajectory.recent != null ? `${trajectory.recent > 0 ? '+' : ''}${trajectory.recent}%` : '—'}\n` +
    `Previous 90 days: ${trajectory.prior != null ? `${trajectory.prior > 0 ? '+' : ''}${trajectory.prior}%` : '—'}`

  return (
    <span className={`traj traj--${spec.tone}`} title={tip}>
      <span className="traj__glyph" aria-hidden="true">
        {spec.glyph}
      </span>
      {showLabel ? (
        <span className="traj__label">{spec.label}</span>
      ) : (
        // Only when the label isn't already visible — otherwise assistive
        // tech reads it twice.
        <span className="sr-only">{spec.label}</span>
      )}
    </span>
  )
}
