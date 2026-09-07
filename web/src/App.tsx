import { useCallback, useEffect, useMemo, useState } from 'react'
import { CompanyPanel } from './components/CompanyPanel'
import { CompanyTable } from './components/CompanyTable'
import { Compare } from './components/Compare'
import { FilterRail } from './components/FilterRail'
import { HeatingUp } from './components/HeatingUp'
import type { Company } from './data/types'
import { useIndex } from './data/useData'
import type { Filters, Sort, SortKey } from './lib/filter'
import { EMPTY_FILTERS, filterCompanies, sortCompanies } from './lib/filter'
import { formatDate, plain, relativeDays } from './lib/format'
import { loadWatchlist, saveWatchlist } from './lib/watchlist'

type View = 'directory' | 'heating' | 'compare'
type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'startup-tracker:theme:v1'

export default function App() {
  const { companies, meta, loading, error } = useIndex()

  const [view, setView] = useState<View>('directory')
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS })
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [watchlist, setWatchlist] = useState<Set<string>>(() => loadWatchlist())
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) ?? 'system'
    } catch {
      return 'system'
    }
  })

  /* The default sort is deliberately name-ascending rather than momentum.
     On a fresh install thousands of companies share an identical score, so a
     momentum-sorted directory would look arbitrary. Once history exists the
     Heating Up tab is the right place for that ranking anyway. */

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
        : // Text sorts read best ascending; numeric ones descending.
          { key, dir: key === 'name' || key === 'sector' ? 'asc' : 'desc' },
    )
  }, [])

  // Filtering is shared across views: narrowing to a sector should narrow the
  // momentum ranking too, not just the directory table.
  const filtered = useMemo(
    () => filterCompanies(companies, filters, watchlist),
    [companies, filters, watchlist],
  )
  const visible = useMemo(() => sortCompanies(filtered, sort), [filtered, sort])

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies])
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const comparing = compareIds.map((id) => byId.get(id)).filter((c): c is Company => Boolean(c))

  const addToCompare = useCallback((id: string) => {
    setCompareIds((prev) => (prev.includes(id) || prev.length >= 3 ? prev : [...prev, id]))
    setView('compare')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (loading) {
    return (
      <div className="shell">
        <Header theme={theme} onTheme={setTheme} />
        <div className="empty">
          <div className="skeleton" style={{ width: 220, height: 12 }} />
          <p className="empty__body">Loading the company index…</p>
        </div>
      </div>
    )
  }

  if (error || !meta) {
    return (
      <div className="shell">
        <Header theme={theme} onTheme={setTheme} />
        <div className="empty">
          <div className="empty__title">Couldn’t load the data</div>
          <p className="empty__body">{error ?? 'The metadata bundle is missing.'}</p>
          <p className="empty__body" style={{ color: 'var(--text-faint)' }}>
            The dashboard reads static JSON produced by the pipeline. If you haven’t run it yet,
            build the bundles first and reload.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="shell">
      <Header theme={theme} onTheme={setTheme} meta={meta} />

      <div className="body">
        <FilterRail meta={meta} filters={filters} onChange={setFilters} watchlistSize={watchlist.size} />

        <main className="main">
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {(
                [
                  ['directory', 'Directory'],
                  ['heating', "What's heating up"],
                  ['compare', `Compare${comparing.length ? ` (${comparing.length})` : ''}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className="tab"
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="toolbar__spacer" />

            {view === 'directory' && (
              <div className="toolbar__count">
                <strong>{plain(visible.length)}</strong>
                {visible.length !== companies.length && ` of ${plain(companies.length)}`} companies
              </div>
            )}
          </div>

          {view === 'directory' &&
            (visible.length === 0 ? (
              <div className="empty">
                <div className="empty__title">No companies match these filters</div>
                <p className="empty__body">
                  Try clearing a filter or broadening the search. The directory holds{' '}
                  {plain(companies.length)} companies.
                </p>
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
            ))}

          {view === 'heating' && (
            <HeatingUp companies={filtered} meta={meta} onSelect={(c) => setSelectedId(c.id)} />
          )}

          {view === 'compare' && (
            <Compare
              companies={comparing}
              meta={meta}
              onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
            />
          )}
        </main>

        {selected && (
          <CompanyPanel
            company={selected}
            meta={meta}
            onClose={() => setSelectedId(null)}
            watched={watchlist.has(selected.id)}
            onToggleWatch={() => toggleWatch(selected.id)}
            onCompare={() => addToCompare(selected.id)}
            canCompare={compareIds.length < 3 && !compareIds.includes(selected.id)}
          />
        )}
      </div>
    </div>
  )
}

function Header({
  theme,
  onTheme,
  meta,
}: {
  theme: Theme
  onTheme: (t: Theme) => void
  meta?: { generatedAt: string | null; counts: { companies: number; signals: number } }
}) {
  const cycle = () => onTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')
  const icon = theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '◐'

  return (
    <header className="header">
      <div className="brand">
        <span className="brand__mark">Signal</span>
        <span className="brand__sub">Startup Tracker</span>
      </div>

      <div className="header__spacer" />

      {meta && (
        <div className="header__meta">
          <span>
            <strong>{plain(meta.counts.companies)}</strong> companies
          </span>
          <span>
            <strong>{plain(meta.counts.signals)}</strong> signals
          </span>
          {meta.generatedAt && (
            <span title={formatDate(meta.generatedAt)}>
              updated {relativeDays(meta.generatedAt.slice(0, 10))}
            </span>
          )}
        </div>
      )}

      <button className="btn btn--ghost" onClick={cycle} aria-label={`Theme: ${theme}. Click to change.`} title={`Theme: ${theme}`}>
        {icon}
      </button>
    </header>
  )
}
