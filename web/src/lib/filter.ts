/** Filtering and sorting over the full company index, done client-side. */

import type { Company } from '../data/types'
import { batchSortKey } from './format'
import { headlineGrowth } from './signals'

/** Ranges are inclusive-lower, exclusive-upper; null means unbounded. */
export interface Range {
  min: number | null
  max: number | null
}

export interface Filters {
  query: string
  sectors: Set<string>
  stages: Set<string>
  statuses: Set<string>
  batch: string
  country: string
  city: string
  remoteOnly: boolean
  origin: 'all' | 'yc' | 'custom'
  hiringOnly: boolean
  watchlistOnly: boolean
  withSignalsOnly: boolean
  fundingStages: Set<string>
  headcount: Range
  growthMin: number | null
  raisedMin: number | null
  fundedWithinDays: number | null
  foundedFrom: number | null
  momentumMin: number | null
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  sectors: new Set(),
  stages: new Set(),
  statuses: new Set(),
  batch: '',
  country: '',
  city: '',
  remoteOnly: false,
  origin: 'all',
  hiringOnly: false,
  watchlistOnly: false,
  withSignalsOnly: false,
  fundingStages: new Set(),
  headcount: { min: null, max: null },
  growthMin: null,
  raisedMin: null,
  fundedWithinDays: null,
  foundedFrom: null,
  momentumMin: null,
}

export type SortKey =
  | 'name'
  | 'momentum'
  | 'headcount'
  | 'growth'
  | 'raised'
  | 'funded'
  | 'batch'
  | 'sector'
  | 'stage'
  | 'location'
  | 'signals'
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
    if (filters.city && c.city !== filters.city) return false
    if (filters.remoteOnly && !c.remote) return false

    if (filters.fundingStages.size) {
      // "Acquired" is a status, not a funding stage, but users reach for it in
      // the same control, so it is matched against either field.
      const stage = c.fundingStage ?? (c.status === 'Acquired' ? 'Acquired' : null)
      if (!stage || !filters.fundingStages.has(stage)) return false
    }

    // Range filters exclude unknowns rather than treating them as zero: a
    // company with no headcount reading is not a company with none.
    if (filters.headcount.min != null || filters.headcount.max != null) {
      if (c.headcount == null) return false
      if (filters.headcount.min != null && c.headcount < filters.headcount.min) return false
      if (filters.headcount.max != null && c.headcount > filters.headcount.max) return false
    }

    if (filters.growthMin != null) {
      const growth = headlineGrowth(c.growth)
      if (!growth || growth.window.pct < filters.growthMin) return false
    }

    if (filters.raisedMin != null && (c.totalRaised ?? 0) < filters.raisedMin) return false

    if (filters.fundedWithinDays != null) {
      const date = c.lastRound?.date
      if (!date) return false
      const days = (Date.now() - new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000
      if (!Number.isFinite(days) || days > filters.fundedWithinDays) return false
    }

    if (filters.foundedFrom != null) {
      const year = c.founded ? Number(c.founded.slice(0, 4)) : NaN
      if (!Number.isFinite(year) || year < filters.foundedFrom) return false
    }

    if (filters.momentumMin != null && (c.momentum?.score ?? 0) < filters.momentumMin) return false
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

/** Funding ladder order, so "Stage" sorts by progression not alphabetically. */
const STAGE_ORDER = ['', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+']

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
      case 'growth': {
        // Unknown growth sorts last in either direction rather than as zero.
        const ga = headlineGrowth(a.growth)?.window.pct ?? Number.NEGATIVE_INFINITY
        const gb = headlineGrowth(b.growth)?.window.pct ?? Number.NEGATIVE_INFINITY
        result = ga - gb
        break
      }
      case 'raised':
        result = (a.totalRaised ?? -1) - (b.totalRaised ?? -1)
        break
      case 'funded':
        result = (a.lastRound?.date ?? '').localeCompare(b.lastRound?.date ?? '')
        break
      case 'stage':
        result = STAGE_ORDER.indexOf(a.fundingStage ?? '') - STAGE_ORDER.indexOf(b.fundingStage ?? '')
        break
      case 'location':
        result = collator.compare(a.country ?? '', b.country ?? '')
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
    (f.city ? 1 : 0) +
    (f.remoteOnly ? 1 : 0) +
    (f.origin !== 'all' ? 1 : 0) +
    (f.hiringOnly ? 1 : 0) +
    (f.watchlistOnly ? 1 : 0) +
    (f.withSignalsOnly ? 1 : 0) +
    f.fundingStages.size +
    (f.headcount.min != null || f.headcount.max != null ? 1 : 0) +
    (f.growthMin != null ? 1 : 0) +
    (f.raisedMin != null ? 1 : 0) +
    (f.fundedWithinDays != null ? 1 : 0) +
    (f.foundedFrom != null ? 1 : 0) +
    (f.momentumMin != null ? 1 : 0)
  )
}
