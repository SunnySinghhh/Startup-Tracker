/**
 * Hash-based routing.
 *
 * The tab (and any open company) lives in the URL rather than in
 * localStorage. That costs nothing extra and buys three things storage
 * can't: a refresh lands where you were, the browser's back and forward
 * buttons work, and a company profile can be linked to someone else.
 *
 * The hash is used rather than real paths because the site is served
 * statically from GitHub Pages, which has no server-side rewrite to send
 * deep links back to index.html. A hash never reaches the server at all.
 *
 *   #/companies
 *   #/companies/yc:legora
 *   #/compare
 */

export type RouteTab =
  | 'overview'
  | 'signals'
  | 'companies'
  | 'funding'
  | 'compare'
  | 'about'

const TABS: RouteTab[] = ['overview', 'signals', 'companies', 'funding', 'compare', 'about']

export interface Route {
  tab: RouteTab
  companyId: string | null
}

export const DEFAULT_ROUTE: Route = { tab: 'overview', companyId: null }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  if (!raw) return DEFAULT_ROUTE

  const [tabPart, ...rest] = raw.split('/')
  const tab = TABS.includes(tabPart as RouteTab) ? (tabPart as RouteTab) : DEFAULT_ROUTE.tab

  // Company ids contain a colon (yc:legora), so the remainder is rejoined
  // rather than assuming a single segment.
  const idPart = rest.join('/')
  const companyId = idPart ? safeDecode(idPart) : null

  return { tab, companyId }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value) || null
  } catch {
    // A malformed escape shouldn't take the whole page down.
    return null
  }
}

export function buildHash(route: Route): string {
  const base = `#/${route.tab}`
  return route.companyId ? `${base}/${encodeURIComponent(route.companyId)}` : base
}

/** Replace rather than push, so routine navigation doesn't bloat history. */
export function writeHash(route: Route, { replace = false } = {}): void {
  const next = buildHash(route)
  if (window.location.hash === next) return
  if (replace) {
    window.history.replaceState(null, '', next)
  } else {
    window.location.hash = next
  }
}
