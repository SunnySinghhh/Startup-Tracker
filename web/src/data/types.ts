/**
 * Shapes of the static JSON bundles produced by the Python pipeline.
 *
 * The exporter omits nulls, empty arrays and `false` to keep index.json small
 * (it halves the payload), so nearly every field here is optional by design.
 * Treat an absent field as "not measured", which is distinct from zero — that
 * distinction is the whole point of the momentum coverage model.
 */

export type Confidence = 'none' | 'low' | 'medium' | 'high'

export interface MomentumComponents {
  headcountGrowth?: number
  headcountDelta?: number
  press?: number
  fundingRecency?: number
  hiring?: number
  github?: number
}

export interface Momentum {
  score: number
  available: number
  coverage: number
  confidence: Confidence
  components?: MomentumComponents
}

export interface Company {
  id: string
  name: string
  tagline?: string
  website?: string
  sector?: string
  subSector?: string
  tags?: string[]
  location?: string
  founded?: string
  status?: string
  stage?: string
  batch?: string
  logo?: string
  profileUrl?: string
  origin?: 'yc' | 'custom'
  topCompany?: boolean
  notes?: string
  headcount?: number
  isHiring?: boolean
  signalCount?: number
  historyPoints?: number
  fundingCount?: number
  momentum?: Momentum
}

export interface Meta {
  generatedAt: string | null
  counts: {
    companies: number
    yc: number
    custom: number
    signals: number
    fundingRounds: number
    snapshots: number
    hiring: number
  }
  history: {
    firstSnapshot: string | null
    latestSnapshot: string | null
    distinctDays: number
    spanDays: number
  }
  facets: {
    sectors: string[]
    subSectors: string[]
    statuses: string[]
    stages: string[]
    batches: string[]
    topTags: string[]
  }
  momentumWeights: Record<string, number>
  ycProfilePrefix: string
  sectorBreakdown: SectorCount[]
}

export interface SectorCount {
  sector: string
  companies: number
  hiring: number
}

/** A signal joined to its company, for the cross-company overview feed. */
export interface RecentSignal {
  id: string
  companyId: string
  company: string
  logo?: string | null
  sector?: string | null
  type: string
  date: string
  title?: string | null
  url?: string | null
  source?: string | null
}

export interface HistoryPoint {
  date: string
  headcount?: number | null
  isHiring?: boolean | null
  githubStars?: number | null
  githubContributors?: number | null
}

export interface Signal {
  id: string
  type: string
  date: string
  title?: string | null
  description?: string | null
  url?: string | null
  source?: string | null
}

export interface FundingRound {
  id: string
  round?: string | null
  amount?: number | null
  currency?: string | null
  date?: string | null
  lead?: string | null
  investors?: string[]
  url?: string | null
  source?: string | null
  roundInferred?: boolean
}

export interface CompanyDetail {
  id: string
  history: HistoryPoint[]
  signals: Signal[]
  funding: FundingRound[]
}

/** A cell in the funding matrix. Absent entirely when a stage wasn't reached. */
export interface FundingCell {
  amount: number
  filings: number
  url?: string | null
  date?: string | null
}

export interface FundingRow {
  id: string
  company: string
  sector?: string | null
  logo?: string | null
  batch?: string | null
  origin?: string | null
  stages: Record<string, FundingCell>
  total: number
  filings: number
  firstDate?: string | null
  lastDate?: string | null
}

export interface FundingMatrix {
  stages: string[]
  rows: FundingRow[]
}
