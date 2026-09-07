/** Filtering and sorting over the full company index, done client-side. */

import type { Company } from '../data/types'
import { batchSortKey } from './format'

export interface Filters {
  query: string
  sectors: Set<string>
  stages: Set<string>
  statuses: Set<string>
  batch: string
  country: string
  remoteOnly: boolean
  origin: 'all' | 'yc' | 'custom'
  hiringOnly: boolean
  watchlistOnly: boolean
  withSignalsOnly: boolean
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  sectors: new Set(),
  stages: new Set(),
  statuses: new Set(),
  batch: '',
  country: '',
  remoteOnly: false,
  origin: 'all',
  hiringOnly: false,
  watchlistOnly: false,
  withSignalsOnly: false,
}

export type SortKey =
  | 'name' | 'momentum' | 'headcount' | 'batch' | 'sector' | 'signals'
export type SortDir = 'asc' | 'desc'

export interface Sort {
  key: SortKey
  dir: SortDir
}

export function filterCompanies(
  companies: Company[],
  filters: Filters,
  watchlist: Set<string>,
): Company[] {
  const q = filters.query.trim().toLowerCase()
  const terms = q ? q.split(/\s+/) : []

  return companies.filter((c) => {
    if (filters.origin !== 'all' && c.origin !== filters.origin) return false
    if (filters.hiringOnly && !c.isHiring) return false
    if (filters.watchlistOnly && !watchlist.has(c.id)) return false
    if (filters.withSignalsOnly && !c.signalCount) return false
    if (filters.batch && c.batch !== filters.batch) return false
    if (filters.country && c.country !== filters.country) return false
    if (filters.remoteOnly && !c.remote) return false
    if (filters.sectors.size && !(c.sector && filters.sectors.has(c.sector))) return false
    if (filters.stages.size && !(c.stage && filters.stages.has(c.stage))) return false
    if (filters.statuses.size && !(c.status && filters.statuses.has(c.status))) return false

    if (terms.length) {
      // Search across the fields a person would actually type into: name,
      // tagline, sector and tags. All terms must match somewhere (AND), which
      // makes "fintech brazil" behave the way people expect.
      const haystack = [
        c.name,
        c.tagline ?? '',
        c.sector ?? '',
        c.subSector ?? '',
        c.location ?? '',
        c.country ?? '',
        c.city ?? '',
        c.batch ?? '',
        ...(c.tags ?? []),
      ]
        .join(' ')
        .toLowerCase()
      for (const term of terms) if (!haystack.includes(term)) return false
    }

    return true
  })
}

const collator = new Intl.Collator('en', { sensitivity: 'base' })

export function sortCompanies(companies: Company[], sort: Sort): Company[] {
  const dir = sort.dir === 'asc' ? 1 : -1
  const sorted = [...companies]

  sorted.sort((a, b) => {
    let result = 0
    switch (sort.key) {
      case 'name':
        result = collator.compare(a.name, b.name)
        break
      case 'momentum':
        result = (a.momentum?.score ?? -1) - (b.momentum?.score ?? -1)
        break
      case 'headcount':
        // Unknown headcount sorts last in either direction rather than
        // masquerading as zero.
        result = (a.headcount ?? -1) - (b.headcount ?? -1)
        break
      case 'batch':
        result = batchSortKey(a.batch) - batchSortKey(b.batch)
        break
      case 'sector':
        result = collator.compare(a.sector ?? '', b.sector ?? '')
        break
      case 'signals':
        result = (a.signalCount ?? 0) - (b.signalCount ?? 0)
        break
    }
    // Stable, predictable tie-break so equal scores don't shuffle between
    // renders — a real problem on day one when thousands share a score.
    if (result === 0) return collator.compare(a.name, b.name)
    return result * dir
  })

  return sorted
}

export function countActiveFilters(f: Filters): number {
  return (
    (f.query.trim() ? 1 : 0) +
    f.sectors.size +
    f.stages.size +
    f.statuses.size +
    (f.batch ? 1 : 0) +
    (f.country ? 1 : 0) +
    (f.remoteOnly ? 1 : 0) +
    (f.origin !== 'all' ? 1 : 0) +
    (f.hiringOnly ? 1 : 0) +
    (f.watchlistOnly ? 1 : 0) +
    (f.withSignalsOnly ? 1 : 0)
  )
}
