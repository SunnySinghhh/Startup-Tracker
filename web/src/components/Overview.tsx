/**
 * Landing page.
 *
 * Deliberately sparse: a statement of what this is, the numbers that say how
 * much it currently knows, and two short lists as entry points. Everything
 * else lives behind a tab. The temptation with a data project is to put every
 * chart on the front page; that produces a wall, not an overview.
 */

import type { Company, Meta, RecentSignal } from '../data/types'
import { compact, formatDate, initials, plain, relativeDays } from '../lib/format'

const SIGNAL_COLOR: Record<string, string> = {
  funding: 'var(--series-4)',
  press: 'var(--series-2)',
  product: 'var(--series-1)',
  hiring: 'var(--series-3)',
  github: 'var(--series-5)',
}

interface Props {
  companies: Company[]
  meta: Meta
  signals: RecentSignal[]
  onSelect: (companyId: string) => void
  onNavigate: (tab: 'companies' | 'funding' | 'about') => void
}

export function Overview({ companies, meta, signals, onSelect, onNavigate }: Props) {
  const top = [...companies]
    .filter((c) => (c.momentum?.score ?? 0) > 0)
    .sort((a, b) => (b.momentum?.score ?? 0) - (a.momentum?.score ?? 0))
    .slice(0, 6)

  const spanDays = meta.history.spanDays
  const topSectors = meta.sectorBreakdown?.slice(0, 6) ?? []
  const sectorPeak = Math.max(1, ...topSectors.map((s) => s.companies))

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero__title">
          Leading signals on <span className="hero__count">{plain(meta.counts.companies)}</span>{' '}
          startups.
        </h1>
        <p className="hero__lede">
          Headcount growth, hiring activity, press mentions and SEC filings — collected daily from
          public sources, and scored so you can see what&apos;s moving before a round is announced.
        </p>
        <div className="hero__actions">
          <button className="btn btn--primary" onClick={() => onNavigate('companies')}>
            Browse companies
          </button>
          <button className="btn" onClick={() => onNavigate('funding')}>
            Funding progression
          </button>
          <button className="btn btn--ghost" onClick={() => onNavigate('about')}>
            How it works →
          </button>
        </div>
      </section>

      <section className="statbar">
        <Stat label="Companies" value={plain(meta.counts.companies)} note="YC 2019+ and manual adds" />
        <Stat label="Actively hiring" value={plain(meta.counts.hiring)} note="live YC hiring flag" />
        <Stat label="Signals logged" value={plain(meta.counts.signals)} note="press and funding events" />
        <Stat label="Observations" value={compact(meta.counts.snapshots)} note="one per company per day" />
        <Stat
          label="History"
          value={spanDays === 0 ? 'Day 1' : `${spanDays}d`}
          note={
            meta.history.firstSnapshot
              ? `since ${formatDate(meta.history.firstSnapshot)}`
              : 'not started'
          }
        />
      </section>

      {spanDays < 14 && (
        <div className="notice">
          <div>
            <strong>This tracker is still building its history.</strong> Headcount growth is the
            heaviest input to the momentum score and needs a trend to compute, so today&apos;s
            ranking leans on hiring and press activity. It sharpens as the daily job accumulates
            observations.
          </div>
        </div>
      )}

      <div className="split">
        <section className="card">
          <header className="card__head">
            <h2 className="card__title">Top momentum</h2>
            <button className="link" onClick={() => onNavigate('companies')}>
              All companies
            </button>
          </header>
          {top.length === 0 ? (
            <p className="card__empty">No company has scored above zero yet.</p>
          ) : (
            <ol className="rank">
              {top.map((company, i) => (
                <li key={company.id}>
                  <button className="rank__row" onClick={() => onSelect(company.id)}>
                    <span className="rank__n">{i + 1}</span>
                    <Logo name={company.name} logo={company.logo} />
                    <span className="rank__text">
                      <span className="rank__name">{company.name}</span>
                      <span className="rank__sub">{company.sector ?? ''}</span>
                    </span>
                    <span className="rank__score">{(company.momentum?.score ?? 0).toFixed(0)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <header className="card__head">
            <h2 className="card__title">Latest signals</h2>
          </header>
          {signals.length === 0 ? (
            <p className="card__empty">No signals matched yet.</p>
          ) : (
            <ul className="feed">
              {signals.slice(0, 6).map((signal) => (
                <li key={signal.id} className="feed__item">
                  <span
                    className="feed__dot"
                    style={{ background: SIGNAL_COLOR[signal.type] ?? 'var(--text-faint)' }}
                  />
                  <div className="feed__body">
                    <button className="feed__company" onClick={() => onSelect(signal.companyId)}>
                      {signal.company}
                    </button>
                    <span className="feed__date">{relativeDays(signal.date)}</span>
                    {signal.url ? (
                      <a
                        className="feed__title"
                        href={signal.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {signal.title}
                      </a>
                    ) : (
                      <span className="feed__title">{signal.title}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <header className="card__head">
          <h2 className="card__title">Sectors</h2>
          <span className="card__note">companies tracked</span>
        </header>
        <div className="bars">
          {topSectors.map((s) => (
            <div className="bars__row" key={s.sector}>
              <span className="bars__label">{s.sector}</span>
              <span className="bars__track">
                <span
                  className="bars__fill"
                  style={{ width: `${(s.companies / sectorPeak) * 100}%` }}
                />
              </span>
              <span className="bars__value">{plain(s.companies)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="statbar__item">
      <div className="statbar__value">{value}</div>
      <div className="statbar__label">{label}</div>
      {note && <div className="statbar__note">{note}</div>}
    </div>
  )
}

function Logo({ name, logo }: { name: string; logo?: string | null }) {
  if (!logo) return <span className="rank__logo rank__logo--fallback">{initials(name)}</span>
  return <img className="rank__logo" src={logo} alt="" loading="lazy" />
}
