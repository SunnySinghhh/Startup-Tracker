import { useCallback, useEffect, useMemo, useState } from 'react'
import { About } from './components/About'
import { CompanyPanel } from './components/CompanyPanel'
import { CompanyTable } from './components/CompanyTable'
import { FilterRail } from './components/FilterRail'
import { FundingMatrix } from './components/FundingMatrix'
import { Overview } from './components/Overview'
import { useFundingMatrix, useIndex, useRecentSignals } from './data/useData'
import type { Filters, Sort, SortKey } from './lib/filter'
import { EMPTY_FILTERS, countActiveFilters, filterCompanies, sortCompanies } from './lib/filter'
import { plain, relativeDays } from './lib/format'
import { loadWatchlist, saveWatchlist } from './lib/watchlist'

/** Four tabs, one job each. The filter rail belongs only to Companies. */
const TABS = [
  ['overview', 'Overview'],
  ['companies', 'Companies'],
  ['funding', 'Funding'],
  ['about', 'About'],
] as const

type Tab = (typeof TABS)[number][0]
type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'startup-tracker:theme:v1'

export default function App() {
  const { companies, meta, loading, error } = useIndex()
  const { signals } = useRecentSignals()

  const [tab, setTab] = useState<Tab>('overview')
  const { matrix, loading: matrixLoading } = useFundingMatrix(tab === 'funding')

  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS })
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  const onSortChange = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' || key === 'sector' ? 'asc' : 'desc' },
    )
  }, [])

  const filtered = useMemo(
    () => filterCompanies(companies, filters, watchlist),
    [companies, filters, watchlist],
  )
  const visible = useMemo(() => sortCompanies(filtered, sort), [filtered, sort])

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies])
  const selected = selectedId ? byId.get(selectedId) ?? null : null

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
  }, [])

  const header = (
    <Header tab={tab} onTab={setTab} theme={theme} onTheme={setTheme} meta={meta} />
  )

  if (loading) {
    return (
      <div className="shell">
        {header}
        <div className="empty">
          <div className="skeleton" style={{ width: 200, height: 10 }} />
          <p className="empty__body">Loading…</p>
        </div>
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
              onSelect={setSelectedId}
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
                {countActiveFilters(filters) > 0 && (
                  <button className="link" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
                    Clear filters
                  </button>
                )}
              </div>
              {visible.length === 0 ? (
                <div className="empty">
                  <div className="empty__title">Nothing matches these filters</div>
                  <button className="btn" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
                    Clear all filters
                  </button>
                </div>
              ) : (
                <CompanyTable
                  companies={visible}
                  sort={sort}
                  onSortChange={onSortChange}
                  selectedId={selectedId}
                  onSelect={(c) => setSelectedId(c.id)}
                  watchlist={watchlist}
                  onToggleWatch={toggleWatch}
                />
              )}
            </>
          )}

          {tab === 'funding' && (
            <FundingMatrix matrix={matrix} meta={meta} loading={matrixLoading} onSelect={setSelectedId} />
          )}

          {tab === 'about' && <About meta={meta} />}
        </main>

        {selected && (
          <CompanyPanel
            company={selected}
            meta={meta}
            onClose={() => setSelectedId(null)}
            watched={watchlist.has(selected.id)}
            onToggleWatch={() => toggleWatch(selected.id)}
          />
        )}
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
}: {
  tab: Tab
  onTab: (t: Tab) => void
  theme: Theme
  onTheme: (t: Theme) => void
  meta: { generatedAt: string | null; counts: { companies: number } } | null
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
