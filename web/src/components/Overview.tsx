/**
 * Landing page.
 *
 * Ordered the way the brief asks: search, then a market summary, then
 * trending, then routes into the table. Deliberately restrained — the
 * directory itself is the product, and a wall of hero cards here would push it
 * further away rather than closer.
 */

import { useMemo, useState } from 'react'
import type { Company, Inflection, Meta, RecentSignal } from '../data/types'
import { compactMoney, formatDate, plain, relativeDays } from '../lib/format'
import { headlineGrowth } from '../lib/signals'
import { InflectionFeed } from './InflectionFeed'
import { TrendingStartups } from './TrendingStartups'

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
  inflections: Inflection[]
  onSelect: (companyId: string) => void
  onNavigate: (tab: 'companies' | 'funding' | 'about' | 'signals') => void
}

export function Overview({ companies, meta, signals, inflections, onSelect, onNavigate }: Props) {
  const [query, setQuery] = useState('')

  const market = useMemo(() => {
    const now = Date.now()
    const monthAgo = now - 30 * 86_400_000

    let fundingThisMonth = 0
    let roundsThisMonth = 0
    const growths: number[] = []

    for (const c of companies) {
      const round = c.lastRound
      if (round?.date) {
        const t = new Date(`${round.date}T00:00:00Z`).getTime()
        if (Number.isFinite(t) && t >= monthAgo) {
          fundingThisMonth += round.amount ?? 0
          roundsThisMonth += 1
        }
      }
      // Median, not mean: a handful of 1000%+ moves on tiny teams would drag a
      // mean far away from what a typical company is doing.
      const g = headlineGrowth(c.growth)
      if (g && g.window.from >= 10) growths.push(g.window.pct)
    }

    growths.sort((a, b) => a - b)
    const median = growths.length ? growths[Math.floor(growths.length / 2)]! : null

    return { fundingThisMonth, roundsThisMonth, medianGrowth: median, sampled: growths.length }
  }, [companies])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return companies
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.tagline ?? '').toLowerCase().includes(q) ||
          (c.sector ?? '').toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [companies, query])

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero__title">
          What&apos;s happening across{' '}
          <span className="hero__count">{plain(meta.counts.companies)}</span> startups.
        </h1>
        <p className="hero__lede">
          Headcount trends, funding filings and press signals — collected from public sources and
          scored so you can see which companies are gaining momentum.
        </p>

        <div className="hero__search">
          <input
            className="input"
            type="search"
            placeholder="Search startups, industries, locations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search startups"
          />
          {matches.length > 0 && (
            <ul className="hero__results">
              {matches.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onSelect(c.id)}>
                    <span className="hero__result-name">{c.name}</span>
                    <span className="hero__result-meta">
                      {c.sector ?? ''}
                      {c.headcount != null && ` · ${plain(c.headcount)} emp`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="statbar">
        <Stat label="Tracked startups" value={plain(meta.counts.companies)} note="YC 2019+ and manual adds" />
        <Stat
          label="Funding last 30d"
          value={market.fundingThisMonth ? compactMoney(market.fundingThisMonth) : '—'}
          note={
            market.roundsThisMonth
              ? `${market.roundsThisMonth} SEC filing${market.roundsThisMonth === 1 ? '' : 's'} — not the whole market`
              : 'no filings in window'
          }
        />
        <Stat label="Companies hiring" value={plain(meta.counts.hiring)} note="live YC hiring flag" />
        <Stat
          label="Median headcount growth"
          value={market.medianGrowth != null ? `${market.medianGrowth >= 0 ? '+' : ''}${market.medianGrowth.toFixed(0)}%` : '—'}
          note={
            market.sampled
              ? market.medianGrowth === 0
                ? `half of ${plain(market.sampled)} tracked teams were flat`
                : `median of ${plain(market.sampled)} teams with ≥10 staff`
              : 'not enough history'
          }
        />
        <Stat
          label="History"
          value={
            meta.history.spanDays >= 365
              ? `${(meta.history.spanDays / 365).toFixed(1)}y`
              : `${meta.history.spanDays}d`
          }
          note={meta.history.firstSnapshot ? `since ${formatDate(meta.history.firstSnapshot)}` : '—'}
        />
      </section>

      <TrendingStartups companies={companies} onSelect={onSelect} />

      <section className="card">
        <header className="card__head">
          <h2 className="card__title">Recent inflections</h2>
          <button className="link" onClick={() => onNavigate('signals')}>
            See all
          </button>
        </header>
        <InflectionFeed inflections={inflections} onSelect={onSelect} limit={6} compact />
      </section>

      <div className="split">
        <section className="card">
          <header className="card__head">
            <h2 className="card__title">Latest signals</h2>
            <button className="link" onClick={() => onNavigate('companies')}>
              Browse all
            </button>
          </header>
          {signals.length === 0 ? (
            <p className="card__empty">No press signals matched yet.</p>
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
                      <a className="feed__title" href={signal.url} target="_blank" rel="noopener noreferrer">
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

        <section className="card">
          <header className="card__head">
            <h2 className="card__title">Sectors</h2>
            <span className="card__note">companies tracked</span>
          </header>
          <div className="bars">
            {(meta.sectorBreakdown ?? []).slice(0, 6).map((s) => {
              const peak = Math.max(1, ...(meta.sectorBreakdown ?? []).map((x) => x.companies))
              return (
                <div className="bars__row" key={s.sector}>
                  <span className="bars__label">{s.sector}</span>
                  <span className="bars__track">
                    <span className="bars__fill" style={{ width: `${(s.companies / peak) * 100}%` }} />
                  </span>
                  <span className="bars__value">{plain(s.companies)}</span>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="hero__actions">
        <button className="btn btn--primary" onClick={() => onNavigate('companies')}>
          Browse all companies
        </button>
        <button className="btn" onClick={() => onNavigate('funding')}>
          Funding progression
        </button>
        <button className="btn btn--ghost" onClick={() => onNavigate('about')}>
          How it works →
        </button>
      </div>
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
