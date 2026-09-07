/**
 * "Similar companies" scoring.
 *
 * Similarity is deliberately explainable rather than clever: each dimension
 * contributes a fixed weight, and the UI shows which ones matched. A ranking
 * nobody can account for is worse than a simple one they can.
 */

import type { Company } from '../data/types'
import { headlineGrowth } from './signals'

export interface Similar {
  company: Company
  score: number
  reasons: string[]
}

/** Same order-of-magnitude headcount, e.g. 40 vs 60 is close, 40 vs 400 isn't. */
function sizeCloseness(a?: number, b?: number): number {
  if (!a || !b) return 0
  const ratio = a > b ? a / b : b / a
  if (ratio <= 1.5) return 1
  if (ratio <= 2.5) return 0.6
  if (ratio <= 4) return 0.25
  return 0
}

export function similarCompanies(target: Company, all: Company[], limit = 4): Similar[] {
  const targetGrowth = headlineGrowth(target.growth)?.window.pct ?? null

  const scored: Similar[] = []
  for (const c of all) {
    if (c.id === target.id) continue

    let score = 0
    const reasons: string[] = []

    if (c.sector && c.sector === target.sector) {
      score += 3
      reasons.push(c.sector)
    }
    if (c.subSector && c.subSector === target.subSector) score += 1.5

    if (c.fundingStage && c.fundingStage === target.fundingStage) {
      score += 2
      reasons.push(c.fundingStage)
    }

    // Size is a gate, not a bonus. A 2-person company is never a useful
    // comparable for a 400-person one however well the sector matches, and
    // treating size as merely additive let exactly that through.
    const size = sizeCloseness(c.headcount, target.headcount)
    if (c.headcount != null && target.headcount != null && size === 0) continue
    if (size > 0) {
      score += size * 2
      if (size === 1) reasons.push('similar size')
    }

    if (c.country && c.country === target.country) {
      score += 1
      if (c.city && c.city === target.city) score += 0.5
    }

    if (targetGrowth != null) {
      const g = headlineGrowth(c.growth)?.window.pct
      if (g != null && Math.abs(g - targetGrowth) <= 25) {
        score += 1
        reasons.push('similar growth')
      }
    }

    // Require more than a single weak overlap, or the list is just "same sector".
    if (score >= 4) scored.push({ company: c, score, reasons: reasons.slice(0, 2) })
  }

  scored.sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
  return scored.slice(0, limit)
}
