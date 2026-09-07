/**
 * Company trajectory as a single chronological list.
 *
 * Events are only those we can evidence: the YC listing, SEC filings, matched
 * press, and headcount milestones derived from the actual series. Milestones
 * are emitted from real observations — the first time a company was *seen* at
 * or above a threshold — and labelled as such, because with change-only
 * sampling the true crossing date sits somewhere between two readings.
 */

import type { FundingRound, HistoryPoint, Signal } from '../data/types'
import { compactMoney, formatDate } from '../lib/format'

interface Props {
  founded?: string | null
  batch?: string | null
  history: HistoryPoint[]
  funding: FundingRound[]
  signals: Signal[]
}

type Event = {
  date: string
  kind: 'founded' | 'funding' | 'milestone' | 'press'
  title: string
  detail?: string
  url?: string | null
  approximate?: boolean
}

const MILESTONES = [10, 25, 50, 100, 250, 500]

const KIND_COLOR: Record<Event['kind'], string> = {
  founded: 'var(--text-faint)',
  funding: 'var(--series-4)',
  milestone: 'var(--series-3)',
  press: 'var(--series-2)',
}

function headcountMilestones(history: HistoryPoint[]): Event[] {
  const points = history.filter((h) => h.headcount != null)
  if (points.length === 0) return []

  const events: Event[] = []
  const hit = new Set<number>()
  let previous: number | null = null

  for (const point of points) {
    const value = point.headcount as number
    const crossed: number[] = []

    for (const threshold of MILESTONES) {
      if (hit.has(threshold)) continue
      if (value >= threshold) {
        hit.add(threshold)
        // Only a crossing counts. A company already above the threshold at the
        // first observation was never seen to cross it.
        if (previous != null && previous < threshold) crossed.push(threshold)
      }
    }

    // A single jump can clear several thresholds at once (65 -> 400 passes
    // 100 and 250). Reporting each separately implies distinct events on the
    // same day; only the highest one is worth a row.
    if (crossed.length > 0) {
      const highest = crossed[crossed.length - 1]!
      events.push({
        date: point.date,
        kind: 'milestone',
        title: `Passed ${highest} employees`,
        detail:
          crossed.length > 1
            ? `Observed at ${value}, up from ${previous} — cleared ${crossed.join(', ')} in one step`
            : `Observed at ${value}, up from ${previous}`,
        approximate: true,
      })
    }
    previous = value
  }
  return events
}

export function FundingTimeline({ founded, batch, history, funding, signals }: Props) {
  const events: Event[] = []

  if (founded) {
    events.push({
      date: founded,
      kind: 'founded',
      title: batch ? `Listed by Y Combinator · ${batch}` : 'Listed by Y Combinator',
      detail: 'YC listing date, not incorporation',
    })
  }

  for (const round of funding) {
    if (!round.date) continue
    events.push({
      date: round.date,
      kind: 'funding',
      title: `${round.round ?? 'Round'}${round.roundInferred ? '?' : ''} · ${
        round.amount ? compactMoney(round.amount) : 'amount not in filing index'
      }`,
      detail: 'SEC Form D',
      url: round.url,
    })
  }

  events.push(...headcountMilestones(history))

  for (const signal of signals.slice(0, 12)) {
    events.push({
      date: signal.date,
      kind: 'press',
      title: signal.title ?? 'Press mention',
      detail: signal.source === 'rss' ? 'Press' : (signal.source ?? undefined),
      url: signal.url,
    })
  }

  events.sort((a, b) => b.date.localeCompare(a.date))

  if (events.length === 0) {
    return <p className="muted-note">No dated events on record yet.</p>
  }

  return (
    <ol className="timeline">
      {events.map((event, i) => (
        <li className="timeline__item" key={`${event.date}-${event.kind}-${i}`}>
          <span className="timeline__dot" style={{ background: KIND_COLOR[event.kind] }} />
          <div className="timeline__body">
            <div className="timeline__date">
              {formatDate(event.date)}
              {event.approximate && (
                <span className="timeline__approx" title="Between two observations">
                  ~
                </span>
              )}
            </div>
            {event.url ? (
              <a className="timeline__title" href={event.url} target="_blank" rel="noopener noreferrer">
                {event.title}
              </a>
            ) : (
              <div className="timeline__title">{event.title}</div>
            )}
            {event.detail && <div className="timeline__detail">{event.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}
