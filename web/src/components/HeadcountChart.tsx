/**
 * Headcount over time with a range switcher.
 *
 * Ranges only appear when the data supports them: a company first observed
 * eight months ago has no "2Y" view, and offering an empty one would suggest
 * the data is missing rather than the company being young.
 *
 * The series is a step function — only changes are stored — so it is drawn
 * with a stepped line rather than straight interpolation between points, which
 * would imply gradual hiring the data doesn't show.
 */

import { useMemo, useState } from 'react'
import type { HistoryPoint } from '../data/types'
import { formatDate, plain } from '../lib/format'

const RANGES = [
  { key: '6M', days: 182 },
  { key: '1Y', days: 365 },
  { key: '2Y', days: 730 },
  { key: 'All', days: Number.POSITIVE_INFINITY },
] as const

const PAD = { top: 10, right: 8, bottom: 20, left: 38 }

export function HeadcountChart({ history }: { history: HistoryPoint[] }) {
  const points = useMemo(
    () =>
      history
        .filter((h) => h.headcount != null)
        .map((h) => ({ date: h.date, value: h.headcount as number })),
    [history],
  )

  const spanDays = useMemo(() => {
    if (points.length < 2) return 0
    const a = new Date(`${points[0]!.date}T00:00:00Z`).getTime()
    const b = new Date(`${points[points.length - 1]!.date}T00:00:00Z`).getTime()
    return Math.round((b - a) / 86_400_000)
  }, [points])

  // Only offer ranges the history can actually fill, plus "All".
  const available = RANGES.filter((r) => r.days === Number.POSITIVE_INFINITY || spanDays >= r.days * 0.6)
  const [range, setRange] = useState(() => available[0]?.key ?? 'All')

  const [width, setWidth] = useState(420)
  const [hover, setHover] = useState<number | null>(null)
  const height = 168

  const ref = (node: HTMLDivElement | null) => {
    if (!node) return
    const measured = node.clientWidth
    if (measured && Math.abs(measured - width) > 1) setWidth(measured)
  }

  const active = available.find((r) => r.key === range) ?? available[available.length - 1]
  const cutoff = active && active.days !== Number.POSITIVE_INFINITY
    ? Date.now() - active.days * 86_400_000
    : 0
  const shown = points.filter((p) => new Date(`${p.date}T00:00:00Z`).getTime() >= cutoff)
  const series = shown.length >= 2 ? shown : points

  const geom = useMemo(() => {
    if (series.length < 2) return null
    const values = series.map((p) => p.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min = Math.max(0, min - 1)
      max = max + 1
    } else {
      const pad = (max - min) * 0.15
      min = Math.max(0, min - pad)
      max += pad
    }
    const innerW = Math.max(1, width - PAD.left - PAD.right)
    const innerH = Math.max(1, height - PAD.top - PAD.bottom)
    const t0 = new Date(`${series[0]!.date}T00:00:00Z`).getTime()
    const t1 = new Date(`${series[series.length - 1]!.date}T00:00:00Z`).getTime()
    const span = Math.max(1, t1 - t0)

    const x = (iso: string) =>
      PAD.left + ((new Date(`${iso}T00:00:00Z`).getTime() - t0) / span) * innerW
    const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH

    // Stepped path: hold the previous value until the date it changed.
    let d = ''
    series.forEach((p, i) => {
      const px = x(p.date)
      const py = y(p.value)
      if (i === 0) d += `M${px},${py}`
      else d += ` L${px},${y(series[i - 1]!.value)} L${px},${py}`
    })

    return { x, y, d, min, max, innerH, innerW }
  }, [series, width])

  if (points.length < 2 || !geom) {
    return (
      <p className="muted-note">
        Not enough history to chart yet — headcount is recorded when it changes, and this company
        has {points.length === 1 ? 'one reading' : 'none'} so far.
      </p>
    )
  }

  const firstValue = series[0]!.value
  const lastValue = series[series.length - 1]!.value
  const delta = lastValue - firstValue
  const pct = firstValue ? (delta / firstValue) * 100 : null
  const hoverPoint = hover != null ? series[hover] : null

  return (
    <div>
      <div className="chart-head">
        <div className="chart-head__figures">
          <span className="chart-head__value num">{plain(lastValue)}</span>
          <span className="chart-head__unit">employees</span>
          {delta !== 0 && (
            <span className={`chart-head__delta ${delta > 0 ? 'is-up' : 'is-down'}`}>
              {delta > 0 ? '+' : ''}
              {plain(delta)} ({pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}) over{' '}
              {active?.key === 'All' ? 'all time' : active?.key}
            </span>
          )}
        </div>
        {available.length > 1 && (
          <div className="rangebar" role="group" aria-label="Chart range">
            {available.map((r) => (
              <button
                key={r.key}
                className="rangebar__btn"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
              >
                {r.key}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chart" ref={ref}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          height={height}
          role="img"
          aria-label="Headcount over time"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const px = e.clientX - rect.left
            let best = 0
            let bestGap = Infinity
            series.forEach((p, i) => {
              const gap = Math.abs(geom.x(p.date) - px)
              if (gap < bestGap) {
                bestGap = gap
                best = i
              }
            })
            setHover(best)
          }}
          onMouseLeave={() => setHover(null)}
        >
          <g className="chart__grid">
            {[geom.max, geom.min].map((t) => (
              <line key={t} x1={PAD.left} x2={width - PAD.right} y1={geom.y(t)} y2={geom.y(t)} />
            ))}
          </g>
          <g className="chart__axis">
            {[geom.max, geom.min].map((t) => (
              <text key={t} x={PAD.left - 6} y={geom.y(t) + 3} textAnchor="end">
                {plain(Math.round(t))}
              </text>
            ))}
            <text x={PAD.left} y={height - 5}>
              {formatDate(series[0]!.date).slice(0, 6)}
            </text>
            <text x={width - PAD.right} y={height - 5} textAnchor="end">
              {formatDate(series[series.length - 1]!.date).slice(0, 6)}
            </text>
          </g>

          <path className="chart__line" d={geom.d} stroke="var(--series-1)" />

          {hoverPoint && (
            <>
              <line
                className="chart__crosshair"
                x1={geom.x(hoverPoint.date)}
                x2={geom.x(hoverPoint.date)}
                y1={PAD.top}
                y2={PAD.top + geom.innerH}
              />
              <circle
                className="chart__dot"
                cx={geom.x(hoverPoint.date)}
                cy={geom.y(hoverPoint.value)}
                r={4}
                fill="var(--series-1)"
              />
            </>
          )}
        </svg>

        {hoverPoint && (
          <div
            className="tooltip"
            style={{ left: geom.x(hoverPoint.date), top: geom.y(hoverPoint.value) }}
          >
            <div className="tooltip__date">{formatDate(hoverPoint.date)}</div>
            <div className="tooltip__value">{plain(hoverPoint.value)} employees</div>
          </div>
        )}
      </div>
    </div>
  )
}
