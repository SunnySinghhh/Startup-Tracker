/**
 * Watchlist persistence.
 *
 * GitHub Pages is static, so a star can't write back to the repository. The
 * watchlist therefore lives in localStorage — instant, private to the browser,
 * and good enough for the "which companies am I following" question.
 *
 * The pipeline reads a *separate* committed file (data/watchlist.json) to
 * decide which companies get expensive per-company enrichment. The UI exposes
 * an export action so the two can be reconciled deliberately, rather than
 * pretending a static page can push state back to git.
 *
 * Every access is guarded: localStorage throws outright in some privacy modes.
 */

const KEY = 'startup-tracker:watchlist:v1'

export function loadWatchlist(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function saveWatchlist(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    /* Private mode or storage disabled — the session still works, it just
       won't persist. Failing loudly here would help nobody. */
  }
}
