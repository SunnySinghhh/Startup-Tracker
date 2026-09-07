import { useCallback, useEffect, useMemo, useState } from 'react'
import { About } from './components/About'
import { CompanyComparison } from './components/CompanyComparison'
import { FilterRail } from './components/FilterRail'
import { FundingMatrix } from './components/FundingMatrix'
import { Overview } from './components/Overview'
import { StartupProfile } from './components/StartupProfile'
import { StartupTable } from './components/StartupTable'
import type { Company } from './data/types'
import { useFundingMatrix, useIndex, useRecentSignals } from './data/useData'
import type { Filters, Sort, SortKey } from './lib/filter'
import { EMPTY_FILTERS, countActiveFilters, filterCompanies, sortCompanies } from './lib/filter'
import { plain, relativeDays } from './lib/format'
import type { Route, RouteTab } from './lib/router'
import { parseHash, writeHash } from './lib/router'
import { loadCompare, loadWatchlist, saveCompare, saveWatchlist } from './lib/watchlist'

const TABS = [
  ['overview', 'Overview'],
  ['companies', 'Companies'],
  ['funding', 'Funding'],
  ['compare', 'Compare'],
  ['about', 'About'],
] as const

type Tab = RouteTab
type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'startup-tracker:theme:v1'
const MAX_COMPARE = 4

/** Sorting options exposed in the toolbar. */
const SORTS: { key: SortKey; label: string; dir: 'asc' | 'desc' }[] = [
  { key: 'momentum', label: 'Momentum', dir: 'desc' },
  { key: 'growth', label: 'Headcount growth', dir: 'desc' },
  { key: 'headcount', label: 'Employees', dir: 'desc' },
  { key: 'raised', label: 'Total raised', dir: 'desc' },
  { key: 'funded', label: 'Recently funded', dir: 'desc' },
  { key: 'batch', label: 'Newest batch', dir: 'desc' },
  { key: 'name', label: 'Name', dir: 'asc' },
]

export default function App() {
  const { companies, meta, loading, error } = useIndex()
  const { signals } = useRecentSignals()

  // The URL is the source of truth for which tab is open and which company is
  // showing, so a refresh lands where you were and a profile can be linked.
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const { tab, companyId: selectedId } = route

  const navigate = useCallback((patch: Partial<Route>) => {
    setRoute((prev) => ({ ...prev, ...patch }))
  }, [])

  const setTab = useCallback(
    (next: Tab) => {
      // Changing tab closes any open profile; leaving it open across a tab
      // switch puts a company panel over an unrelated view.
      navigate({ tab: next, companyId: null })
    },
    [navigate],
  )

  const setSelectedId = useCallback(
    (id: string | null) => navigate({ companyId: id }),
    [navigate],
  )

  // Reflect state into the URL. writeHash no-ops when the hash already
  // matches, which is what stops this from looping against the listener below.
  useEffect(() => {
    writeHash(route, { replace: !window.location.hash })
  }, [route])

  // Back/forward buttons.
  useEffect(() => {
    const onHash = () => {
      const next = parseHash(window.location.hash)
      setRoute((prev) =>
        prev.tab === next.tab && prev.companyId === next.companyId ? prev : next,
      )
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const { matrix, loading: matrixLoading } = useFundingMatrix(tab === 'funding')

  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS }))
  // Momentum is the default discovery sort: the product's question is which
  // companies are moving, not which come first alphabetically.
  const [sort, setSort] = useState<Sort>({ key: 'momentum', dir: 'desc' })
  // Persisted so a comparison you assembled survives a reload and only clears
  // when you clear it.
  const [compareIds, setCompareIds] = useState<string[]>(() => loadCompare())
  const [watchlist, setWatchlist] = useState<Set<string>>(() => loadWatchlist())
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) ?? 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* storage disabled — theme still applies for this session */
    }
  }, [theme])

  const toggleWatch = useCallback((id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveWatchlist(next)
      return next
    })
  }, [])

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_COMPARE
          ? prev
          : [...prev, id]
      saveCompare(next)
      return next
    })
  }, [])

  const removeFromCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = prev.filter((x) => x !== id)
      saveCompare(next)
      return next
    })
  }, [])

  const onSortChange = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: SORTS.find((s) => s.key === key)?.dir ?? 'desc' },
    )
  }, [])

  const filtered = useMemo(
    () => filterCompanies(companies, filters, watchlist),
    [companies, filters, watchlist],
  )
  const visible = useMemo(() => sortCompanies(filtered, sort), [filtered, sort])

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies])

  // A persisted selection can outlive the company it points at — the tracked
  // universe changes as cohorts age out. Drop ids that no longer resolve, once
  // the index has actually loaded, so storage doesn't accumulate dead entries.
  useEffect(() => {
    if (companies.length === 0) return
    setCompareIds((prev) => {
      const live = prev.filter((id) => byId.has(id))
      if (live.length === prev.length) return prev
      saveCompare(live)
      return live
    })
  }, [companies.length, byId])
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null
  const comparing = compareIds.map((id) => byId.get(id)).filter((c): c is Company => Boolean(c))

  const openCompany = useCallback((id: string) => setSelectedId(id), [setSelectedId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        setTab('companies')
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelectedId, setTab])

  const header = (
    <Header
      tab={tab}
      onTab={setTab}
      theme={theme}
      onTheme={setTheme}
      meta={meta}
      compareCount={comparing.length}
    />
  )

  if (loading) {
    return (
      <div className="shell">
        {header}
        <TableSkeleton />
      </div>
    )
  }

  if (error || !meta) {
    return (
      <div className="shell">
        {header}
        <div className="empty">
          <div className="empty__title">Couldn’t load the data</div>
          <p className="empty__body">{error ?? 'The metadata bundle is missing.'}</p>
        </div>
      </div>
    )
  }

  const showRail = tab === 'companies'
  const activeFilters = countActiveFilters(filters)

  return (
    <div className="shell">
      {header}

      <div className="body">
        {showRail && (
          <FilterRail
            meta={meta}
            filters={filters}
            onChange={setFilters}
            watchlistSize={watchlist.size}
          />
        )}

        <main className="main">
          {tab === 'overview' && (
            <Overview
              companies={companies}
              meta={meta}
              signals={signals}
              onSelect={openCompany}
              onNavigate={setTab}
            />
          )}

          {tab === 'companies' && (
            <>
              <div className="controls controls--bar">
                <span className="controls__count">
                  <strong>{plain(visible.length)}</strong>
                  {visible.length !== companies.length && ` of ${plain(companies.length)}`} companies
                </span>
                {activeFilters > 0 && (
                  <button className="link" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
                    Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
                  </button>
                )}
                <span className="toolbar__spacer" />
                {comparing.length > 0 && (
                  <button className="btn btn--ghost" onClick={() => setTab('compare')}>
                    Compare {comparing.length}
                  </button>
                )}
                <label className="sortby">
                  <span>Sort</span>
                  <select
                    className="select select--sm"
                    value={sort.key}
                    onChange={(e) => onSortChange(e.target.value as SortKey)}
                    aria-label="Sort companies"
                  >
                    {SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {visible.length === 0 ? (
                <NoResults
                  hasQuery={Boolean(filters.query.trim())}
                  onClear={() => setFilters({ ...EMPTY_FILTERS })}
                />
              ) : (
                <StartupTable
                  companies={visible}
                  sort={sort}
                  onSortChange={onSortChange}
                  selectedId={selectedId}
                  onSelect={(c) => setSelectedId(c.id)}
                  watchlist={watchlist}
                  onToggleWatch={toggleWatch}
                  compareIds={compareIds}
                  onToggleCompare={toggleCompare}
                />
              )}
            </>
          )}

          {tab === 'funding' && (
            <FundingMatrix
              matrix={matrix}
              meta={meta}
              loading={matrixLoading}
              onSelect={openCompany}
            />
          )}

          {tab === 'compare' && (
            <div className="page">
              <header className="page__head">
                <div>
                  <h1 className="page__title">Compare</h1>
                  <p className="page__lede">
                    Up to {MAX_COMPARE} companies side by side. The strongest value in each
                    comparable row is highlighted, but only when at least two companies have it.
                  </p>
                </div>
              </header>
              <CompanyComparison
                companies={comparing}
                onRemove={removeFromCompare}
                onSelect={openCompany}
              />
            </div>
          )}

          {tab === 'about' && <About meta={meta} />}
        </main>

        {selected && (
          <StartupProfile
            company={selected}
            meta={meta}
            allCompanies={companies}
            onClose={() => setSelectedId(null)}
            watched={watchlist.has(selected.id)}
            onToggleWatch={toggleWatch}
            onSelect={openCompany}
            onToggleCompare={toggleCompare}
            comparing={compareIds.includes(selected.id)}
          />
        )}
      </div>
    </div>
  )
}

function NoResults({ hasQuery, onClear }: { hasQuery: boolean; onClear: () => void }) {
  return (
    <div className="empty">
      <div className="empty__title">
        {hasQuery ? 'No companies match that search' : 'No companies match these filters'}
      </div>
      <p className="empty__body">
        {hasQuery
          ? 'Try a shorter term, or search by industry, city or batch instead.'
          : 'Some filters exclude companies with missing data — a headcount range, for example, can only match companies we have a reading for.'}
      </p>
      <button className="btn" onClick={onClear}>
        Clear all filters
      </button>
    </div>
  )
}

/** Skeleton that mirrors the real table's shape rather than a generic spinner. */
function TableSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading companies">
      <div className="skeleton" style={{ width: 200, height: 14 }} />
      <div className="skeleton-rows">
        {Array.from({ length: 10 }).map((_, i) => (
          <div className="skeleton-row" key={i}>
            <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 4 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: `${30 + ((i * 7) % 40)}%`, height: 10 }} />
              <div className="skeleton" style={{ width: `${45 + ((i * 11) % 30)}%`, height: 8, marginTop: 6 }} />
            </div>
            <div className="skeleton" style={{ width: 70, height: 10 }} />
            <div className="skeleton" style={{ width: 54, height: 10 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Header({
  tab,
  onTab,
  theme,
  onTheme,
  meta,
  compareCount,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  theme: Theme
  onTheme: (t: Theme) => void
  meta: { generatedAt: string | null } | null
  compareCount: number
}) {
  const cycle = () => onTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')
  const icon = theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '◐'

  return (
    <header className="header">
      <button className="brand" onClick={() => onTab('overview')}>
        <span className="brand__mark">Signal</span>
      </button>

      <nav className="nav" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className="nav__tab"
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => onTab(key)}
          >
            {label}
            {key === 'compare' && compareCount > 0 && (
              <span className="nav__count">{compareCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="header__spacer" />

      {meta?.generatedAt && (
        <span className="header__stamp">updated {relativeDays(meta.generatedAt)}</span>
      )}

      <button className="btn btn--ghost" onClick={cycle} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`}>
        {icon}
      </button>
    </header>
  )
}
