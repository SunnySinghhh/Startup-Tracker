/**
 * The startup directory table.
 *
 * Dense by design: the row should answer "what is happening with this company"
 * at a glance — stage, capital, headcount *and its direction*, momentum — not
 * merely "this company exists". The sparkline sits beside the headcount so the
 * trend is readable without opening anything.
 *
 * Virtualised: the index holds ~4,500 companies and filters run in the browser,
 * so only rows in the viewport are mounted. Row height is fixed, which is what
 * keeps the windowing this simple.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Company } from '../data/types'
import type { Sort, SortKey } from '../lib/filter'
import { compactMoney, formatDate, initials, relativeDays } from '../lib/format'
import { GrowthCell } from './GrowthCell'
import { MomentumScore, SignalTags, StageBadge } from './MomentumBadge'
import { WatchlistButton } from './WatchlistButton'

const ROW_HEIGHT = 60
const OVERSCAN = 8

interface Props {
  companies: Company[]
  sort: Sort
  onSortChange: (key: SortKey) => void
  selectedId: string | null
  onSelect: (company: Company) => void
  watchlist: Set<string>
  onToggleWatch: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
}

export function StartupTable({
  companies,
  sort,
  onSortChange,
  selectedId,
  onSelect,
  watchlist,
  onToggleWatch,
  compareIds,
  onToggleCompare,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportHeight(entry.contentRect.height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [companies])

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
  const last = Math.min(companies.length, first + visibleCount)
  const visible = companies.slice(first, last)

  const header = (key: SortKey, label: string, extra = '', right = false) => (
    <div
      className={`th${right ? ' th--right' : ''}${extra ? ` ${extra}` : ''}`}
      data-active={sort.key === key}
      onClick={() => onSortChange(key)}
      role="columnheader"
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSortChange(key)
        }
      }}
    >
      <span>{label}</span>
      {sort.key === key && <span className="th__arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </div>
  )

  return (
    <>
      <div className="thead" role="row">
        <div />
        {header('name', 'Company')}
        {header('sector', 'Industry', 'col-sector')}
        {header('stage', 'Stage', 'col-stage')}
        {header('raised', 'Raised', 'col-raised', true)}
        {header('growth', 'Team · growth', 'col-growth')}
        {header('location', 'Location', 'col-location')}
        {header('funded', 'Last round', 'col-funded', true)}
        {header('momentum', 'Mom.', 'col-momentum', true)}
      </div>

      <div className="table-wrap" ref={scrollRef} onScroll={onScroll}>
        <div style={{ height: companies.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
            {visible.map((company) => (
              <StartupRow
                key={company.id}
                company={company}
                selected={company.id === selectedId}
                watched={watchlist.has(company.id)}
                comparing={compareIds.includes(company.id)}
                onSelect={onSelect}
                onToggleWatch={onToggleWatch}
                onToggleCompare={onToggleCompare}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export function StartupRow({
  company,
  selected,
  watched,
  comparing,
  onSelect,
  onToggleWatch,
  onToggleCompare,
}: {
  company: Company
  selected: boolean
  watched: boolean
  comparing: boolean
  onSelect: (c: Company) => void
  onToggleWatch: (id: string) => void
  onToggleCompare: (id: string) => void
}) {
  const location = company.city
    ? `${company.city}${company.country && company.country !== company.city ? `, ${company.country}` : ''}`
    : (company.country ?? null)

  return (
    <div
      className="row"
      data-selected={selected}
      data-comparing={comparing}
      onClick={() => onSelect(company)}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(company)
        if (e.key === 'c') onToggleCompare(company.id)
      }}
    >
      <WatchlistButton
        id={company.id}
        name={company.name}
        watched={watched}
        onToggle={onToggleWatch}
      />

      <div className="company">
        <Logo company={company} />
        <div className="company__text">
          <span className="company__line">
            <span className="company__name">{company.name}</span>
            <SignalTags company={company} max={1} />
          </span>
          {company.tagline && <span className="company__tagline">{company.tagline}</span>}
        </div>
      </div>

      <div className="cell cell--text col-sector">{company.sector ?? '—'}</div>

      <div className="cell col-stage">
        <StageBadge company={company} />
      </div>

      <div className="cell cell--right num col-raised">
        {company.totalRaised ? (
          <span title={`Across ${company.roundCount ?? 1} SEC filing(s)`}>
            {compactMoney(company.totalRaised)}
          </span>
        ) : (
          <span className="cell--absent">—</span>
        )}
      </div>

      <div className="cell col-growth">
        <GrowthCell company={company} />
      </div>

      <div className="cell cell--text cell--dim col-location">{location ?? '—'}</div>

      <div className="cell cell--right col-funded">
        {company.lastRound?.date ? (
          <span className="cell--dim" title={formatDate(company.lastRound.date)}>
            {relativeDays(company.lastRound.date)}
          </span>
        ) : (
          <span className="cell--absent">—</span>
        )}
      </div>

      <div className="cell cell--right col-momentum">
        <MomentumScore company={company} />
      </div>
    </div>
  )
}

function Logo({ company }: { company: Company }) {
  const [failed, setFailed] = useState(false)
  if (!company.logo || failed) {
    return <div className="company__logo company__logo--fallback">{initials(company.name)}</div>
  }
  return (
    <img
      className="company__logo"
      src={company.logo}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
