/**
 * Virtualised company table.
 *
 * The index holds ~6,200 companies and filters run client-side, so the table
 * must stay responsive while every keystroke re-filters the whole set. Only the
 * rows inside the viewport (plus a small overscan) are mounted; a spacer div
 * carries the full scroll height so the scrollbar stays honest.
 *
 * Windowing is ~40 lines here and avoids a dependency whose API would outlive
 * its usefulness. Rows are a fixed height, which is what makes it this simple.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Company } from '../data/types'
import { compact, initials, plain } from '../lib/format'
import type { Sort, SortKey } from '../lib/filter'
import { MomentumBar } from './Momentum'

const ROW_HEIGHT = 46
const OVERSCAN = 8

const COLUMNS = '30px minmax(180px, 2.4fr) 132px 104px 74px 152px 58px'

interface Props {
  companies: Company[]
  sort: Sort
  onSortChange: (key: SortKey) => void
  selectedId: string | null
  onSelect: (company: Company) => void
  watchlist: Set<string>
  onToggleWatch: (id: string) => void
}

export function CompanyTable({
  companies,
  sort,
  onSortChange,
  selectedId,
  onSelect,
  watchlist,
  onToggleWatch,
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

  // Filters changing should put the user back at the top of the results.
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

  const header = (key: SortKey, label: string, right = false) => (
    <div
      className={`th${right ? ' th--right' : ''}`}
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
      <div className="thead" style={{ gridTemplateColumns: COLUMNS }} role="row">
        <div />
        {header('name', 'Company')}
        {header('sector', 'Sector')}
        {header('batch', 'Batch')}
        {header('headcount', 'Team', true)}
        {header('momentum', 'Momentum', true)}
        {header('signals', 'Sig.', true)}
      </div>

      <div className="table-wrap" ref={scrollRef} onScroll={onScroll}>
        <div style={{ height: companies.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
            {visible.map((company) => (
              <Row
                key={company.id}
                company={company}
                selected={company.id === selectedId}
                watched={watchlist.has(company.id)}
                onSelect={onSelect}
                onToggleWatch={onToggleWatch}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function Row({
  company,
  selected,
  watched,
  onSelect,
  onToggleWatch,
}: {
  company: Company
  selected: boolean
  watched: boolean
  onSelect: (c: Company) => void
  onToggleWatch: (id: string) => void
}) {
  const score = company.momentum?.score

  return (
    <div
      className="row"
      style={{ gridTemplateColumns: COLUMNS }}
      data-selected={selected}
      onClick={() => onSelect(company)}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(company)
      }}
    >
      <button
        className="star"
        data-on={watched}
        aria-label={watched ? `Remove ${company.name} from watchlist` : `Add ${company.name} to watchlist`}
        aria-pressed={watched}
        onClick={(e) => {
          e.stopPropagation()
          onToggleWatch(company.id)
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={watched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6-5.9-3.2-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z" />
        </svg>
      </button>

      <div className="company">
        <Logo company={company} />
        <div className="company__text">
          <span className="company__name">{company.name}</span>
          {company.tagline && <span className="company__tagline">{company.tagline}</span>}
        </div>
      </div>

      <div className="cell" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {company.sector ?? '—'}
      </div>

      <div className="cell" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {company.batch ?? (company.origin === 'custom' ? 'Non-YC' : '—')}
      </div>

      <div className="cell cell--right num" style={{ fontSize: 'var(--text-xs)', color: company.headcount ? 'var(--text-secondary)' : 'var(--text-faint)' }}>
        {company.headcount ? plain(company.headcount) : '—'}
      </div>

      <div className="cell" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MomentumBar momentum={company.momentum} height={6} showEmptyTrack={false} />
        </div>
        <span
          className="num"
          style={{
            fontSize: 'var(--text-xs)',
            width: 30,
            textAlign: 'right',
            color: score ? 'var(--text-primary)' : 'var(--text-faint)',
            fontWeight: score ? 550 : 400,
          }}
        >
          {score ? score.toFixed(0) : '—'}
        </span>
      </div>

      <div className="cell cell--right num" style={{ fontSize: 'var(--text-xs)', color: company.signalCount ? 'var(--text-secondary)' : 'var(--text-faint)' }}>
        {company.signalCount ? compact(company.signalCount) : '—'}
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
