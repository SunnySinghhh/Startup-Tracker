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

/** Empty input means "no bound", not zero. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
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
        <label className="check">
          <input
            type="checkbox"
            checked={filters.remoteOnly}
            onChange={(e) => onChange({ ...filters, remoteOnly: e.target.checked })}
          />
          Remote
          <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>
            {plain(meta.remoteCount ?? 0)}
          </span>
        </label>
      </div>

      <div className="rail__group">
        <div className="rail__label">
          Location
          {filters.country && <span className="rail__count">1</span>}
        </div>
        <select
          className="select"
          value={filters.country}
          onChange={(e) => onChange({ ...filters, country: e.target.value })}
          aria-label="Filter by country"
        >
          <option value="">All countries</option>
          {(meta.facets.countries ?? []).map(({ country, companies }) => (
            <option key={country} value={country}>
              {country} ({plain(companies)})
            </option>
          ))}
        </select>
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
        <div className="rail__label">
          Funding stage
          {filters.fundingStages.size > 0 && (
            <span className="rail__count">{filters.fundingStages.size}</span>
          )}
        </div>
        {['Seed', 'Series A', 'Series B', 'Series C', 'Series D+', 'Acquired'].map((stage) => (
          <label className="check" key={stage}>
            <input
              type="checkbox"
              checked={filters.fundingStages.has(stage)}
              onChange={() => {
                const next = new Set(filters.fundingStages)
                if (next.has(stage)) next.delete(stage)
                else next.add(stage)
                onChange({ ...filters, fundingStages: next })
              }}
            />
            {stage}
          </label>
        ))}
        <p className="rail__hint">
          From SEC filings; companies with none are excluded rather than assumed bootstrapped.
        </p>
      </div>

      <div className="rail__group">
        <div className="rail__label">Employees</div>
        <div className="rail__row">
          <input
            className="input input--sm"
            type="number"
            min={0}
            placeholder="Min"
            value={filters.headcount.min ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                headcount: { ...filters.headcount, min: numberOrNull(e.target.value) },
              })
            }
            aria-label="Minimum employees"
          />
          <span className="rail__dash">–</span>
          <input
            className="input input--sm"
            type="number"
            min={0}
            placeholder="Max"
            value={filters.headcount.max ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                headcount: { ...filters.headcount, max: numberOrNull(e.target.value) },
              })
            }
            aria-label="Maximum employees"
          />
        </div>
      </div>

      <div className="rail__group">
        <div className="rail__label">Headcount growth</div>
        <select
          className="select"
          value={filters.growthMin ?? ''}
          onChange={(e) => onChange({ ...filters, growthMin: numberOrNull(e.target.value) })}
          aria-label="Minimum headcount growth"
        >
          <option value="">Any</option>
          <option value="0">Growing (&gt;0%)</option>
          <option value="20">&gt; 20%</option>
          <option value="50">&gt; 50%</option>
          <option value="100">&gt; 100%</option>
        </select>
      </div>

      <div className="rail__group">
        <div className="rail__label">Total raised</div>
        <select
          className="select"
          value={filters.raisedMin ?? ''}
          onChange={(e) => onChange({ ...filters, raisedMin: numberOrNull(e.target.value) })}
          aria-label="Minimum total raised"
        >
          <option value="">Any</option>
          <option value="1000000">$1M+</option>
          <option value="5000000">$5M+</option>
          <option value="20000000">$20M+</option>
          <option value="100000000">$100M+</option>
        </select>
      </div>

      <div className="rail__group">
        <div className="rail__label">Last funded</div>
        <select
          className="select"
          value={filters.fundedWithinDays ?? ''}
          onChange={(e) => onChange({ ...filters, fundedWithinDays: numberOrNull(e.target.value) })}
          aria-label="Funded within"
        >
          <option value="">Any time</option>
          <option value="90">Last 90 days</option>
          <option value="180">Last 6 months</option>
          <option value="365">Last year</option>
        </select>
      </div>

      <div className="rail__group">
        <div className="rail__label">Momentum score</div>
        <select
          className="select"
          value={filters.momentumMin ?? ''}
          onChange={(e) => onChange({ ...filters, momentumMin: numberOrNull(e.target.value) })}
          aria-label="Minimum momentum score"
        >
          <option value="">Any</option>
          <option value="12">12+ (moderate)</option>
          <option value="25">25+ (high)</option>
          <option value="40">40+ (very high)</option>
        </select>
      </div>

      <div className="rail__group">
        <div className="rail__label">YC stage</div>
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
