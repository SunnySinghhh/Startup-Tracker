/** Left filter rail. Every control narrows the client-side company set. */

import type { Meta } from '../data/types'
import type { Filters } from '../lib/filter'
import { countActiveFilters, EMPTY_FILTERS } from '../lib/filter'
import { plain } from '../lib/format'

interface Props {
  meta: Meta
  filters: Filters
  onChange: (next: Filters) => void
  watchlistSize: number
}

export function FilterRail({ meta, filters, onChange, watchlistSize }: Props) {
  const active = countActiveFilters(filters)

  const toggleSet = (key: 'sectors' | 'stages' | 'statuses', value: string) => {
    const next = new Set(filters[key])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange({ ...filters, [key]: next })
  }

  return (
    <aside className="rail" aria-label="Filters">
      <div className="rail__group">
        <div className="search">
          <span className="search__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            className="input"
            type="search"
            placeholder="Search companies…"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            aria-label="Search companies"
          />
        </div>
      </div>

      {active > 0 && (
        <button className="btn btn--ghost" onClick={() => onChange({ ...EMPTY_FILTERS })} style={{ justifyContent: 'center' }}>
          Clear {active} filter{active === 1 ? '' : 's'}
        </button>
      )}

      <div className="rail__group">
        <div className="rail__label">Quick filters</div>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.watchlistOnly}
            onChange={(e) => onChange({ ...filters, watchlistOnly: e.target.checked })}
          />
          Watchlist only
          <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>
            {watchlistSize}
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.hiringOnly}
            onChange={(e) => onChange({ ...filters, hiringOnly: e.target.checked })}
          />
          Actively hiring
          <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>
            {plain(meta.counts.hiring)}
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.withSignalsOnly}
            onChange={(e) => onChange({ ...filters, withSignalsOnly: e.target.checked })}
          />
          Has recent signals
        </label>
      </div>

      <div className="rail__group">
        <div className="rail__label">
          Sector
          {filters.sectors.size > 0 && <span className="rail__count">{filters.sectors.size}</span>}
        </div>
        {meta.facets.sectors.map((sector) => (
          <label className="check" key={sector}>
            <input
              type="checkbox"
              checked={filters.sectors.has(sector)}
              onChange={() => toggleSet('sectors', sector)}
            />
            {sector}
          </label>
        ))}
      </div>

      <div className="rail__group">
        <div className="rail__label">Stage</div>
        {meta.facets.stages.map((stage) => (
          <label className="check" key={stage}>
            <input
              type="checkbox"
              checked={filters.stages.has(stage)}
              onChange={() => toggleSet('stages', stage)}
            />
            {stage}
          </label>
        ))}
      </div>

      <div className="rail__group">
        <div className="rail__label">Status</div>
        {meta.facets.statuses.map((status) => (
          <label className="check" key={status}>
            <input
              type="checkbox"
              checked={filters.statuses.has(status)}
              onChange={() => toggleSet('statuses', status)}
            />
            {status}
          </label>
        ))}
      </div>

      <div className="rail__group">
        <div className="rail__label">Batch</div>
        <select
          className="select"
          value={filters.batch}
          onChange={(e) => onChange({ ...filters, batch: e.target.value })}
          aria-label="Filter by YC batch"
        >
          <option value="">All batches</option>
          {[...meta.facets.batches].reverse().map((batch) => (
            <option key={batch} value={batch}>
              {batch}
            </option>
          ))}
        </select>
      </div>

      <div className="rail__group">
        <div className="rail__label">Source</div>
        <select
          className="select"
          value={filters.origin}
          onChange={(e) => onChange({ ...filters, origin: e.target.value as Filters['origin'] })}
          aria-label="Filter by data source"
        >
          <option value="all">All sources ({plain(meta.counts.companies)})</option>
          <option value="yc">Y Combinator ({plain(meta.counts.yc)})</option>
          <option value="custom">Added manually ({plain(meta.counts.custom)})</option>
        </select>
      </div>
    </aside>
  )
}
