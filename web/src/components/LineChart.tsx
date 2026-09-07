/**
 * Single-series time chart with a crosshair + tooltip hover layer.
 *
 * One series only, deliberately: two measures on one plot would need two
 * y-scales, and a dual-axis chart makes the relationship between the series an
 * artefact of how the axes were scaled. Where two measures matter, the panel
 * stacks two charts sharing an x-axis instead.
 *
 * No legend: with a single series the section title names it, so a legend box
 * would be redundant furniture.
 */

import { useMemo, useState } from 'react'
import { formatDate, plain } from '../lib/format'

export interface LinePoint {
  date: string
  value: number
}

interface Props {
  points: LinePoint[]
  height?: number
  color?: string
  label: string
  /** Force the y-axis to include zero. Off by default: for headcount the
      interesting range is usually a narrow band well above zero. */
  zeroBaseline?: boolean
}

const PAD = { top: 8, right: 8, bottom: 20, left: 34 }

export function LineChart({
  points,
  height = 140,
  color = 'var(--series-1)',
  label,
  zeroBaseline = false,
}: Props) {
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)
  const [width, setWidth] = useState(320)

  // Callback ref doubles as the measurement hook: the chart is drawn in user
  // units scaled to whatever width the container resolves to.
  const ref = (node: HTMLDivElement | null) => {
    if (!node) return
    const measured = node.clientWidth
    if (measured && Math.abs(measured - width) > 1) setWidth(measured)
  }

  const geom = useMemo(() => {
    if (points.length === 0) return null

    const values = points.map((p) => p.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (zeroBaseline) min = Math.min(0, min)
    if (min === max) {
      // A flat series still deserves a sensible band rather than a divide-by-zero.
      min = min - 1
      max = max + 1
    } else {
      const pad = (max - min) * 0.12
      min -= pad
      max += pad
    }

    const innerW = Math.max(1, width - PAD.left - PAD.right)
    const innerH = Math.max(1, height - PAD.top - PAD.bottom)

    const x = (i: number) =>
      PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
    const area =
      `M${x(0)},${PAD.top + innerH} ` +
      points.map((p, i) => `L${x(i)},${y(p.value)}`).join(' ') +
      ` L${x(points.length - 1)},${PAD.top + innerH} Z`

    return { x, y, line, area, min, max, innerH, innerW }
  }, [points, width, height, zeroBaseline])

  if (!geom || points.length === 0) return null

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - rect.left
    const ratio = (px - PAD.left) / Math.max(1, geom.innerW)
    const index = Math.round(ratio * (points.length - 1))
    const clamped = Math.max(0, Math.min(points.length - 1, index))
    const point = points[clamped]
    if (!point) return
    setHover({ index: clamped, x: geom.x(clamped), y: geom.y(point.value) })
  }

  const active = hover ? points[hover.index] : null
  const ticks = [geom.max, geom.min]

  return (
    <div className="chart" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        height={height}
        role="img"
        aria-label={`${label} over time`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <g className="chart__grid">
          {ticks.map((t) => (
            <line key={t} x1={PAD.left} x2={width - PAD.right} y1={geom.y(t)} y2={geom.y(t)} />
          ))}
        </g>
        <g className="chart__axis">
          {ticks.map((t) => (
            <text key={t} x={PAD.left - 6} y={geom.y(t) + 3} textAnchor="end">
              {plain(Math.round(t))}
            </text>
          ))}
          <text x={PAD.left} y={height - 6}>
            {formatDate(points[0]?.date).slice(0, 6)}
          </text>
          <text x={width - PAD.right} y={height - 6} textAnchor="end">
            {formatDate(points[points.length - 1]?.date).slice(0, 6)}
          </text>
        </g>

        <path className="chart__area" d={geom.area} fill={color} />
        <path className="chart__line" d={geom.line} stroke={color} />

        {hover && active && (
          <>
            <line
              className="chart__crosshair"
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={PAD.top + geom.innerH}
            />
            <circle className="chart__dot" cx={hover.x} cy={hover.y} r={4.5} fill={color} />
          </>
        )}
      </svg>

      {hover && active && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="tooltip__date">{formatDate(active.date)}</div>
          <div className="tooltip__value">
            {plain(active.value)} {label.toLowerCase()}
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact inline trend, for table rows. No axes, no hover — it's a glyph. */
export function Sparkline({
  points,
  width = 68,
  height = 20,
  color = 'var(--series-1)',
}: {
  points: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * (width - 2) + 1
      const y = height - 1 - ((v - min) / span) * (height - 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
