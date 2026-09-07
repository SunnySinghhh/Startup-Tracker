/**
 * Derived display signals: funding stage badges, momentum tags, freshness.
 *
 * Everything here is computed from data we actually hold. Where a value is
 * unknown the helpers return null so the UI can render "—" rather than a
 * plausible-looking default — a directory that guesses is worse than one that
 * admits a gap.
 */

import type { Company, GrowthWindow, GrowthWindows } from '../data/types'

/* ---- Funding stage ------------------------------------------------------- */

export type StageTone = 'pre-seed' | 'seed' | 'a' | 'b' | 'c-plus' | 'bootstrapped' | 'acquired'

export interface StageBadge {
  label: string
  tone: StageTone
  /** True when the stage was inferred rather than stated by the source. */
  inferred: boolean
}

/**
 * Companies with no SEC filing are *not* labelled "Bootstrapped" — absence of
 * a US filing is not evidence of no funding (most YC companies are too early,
 * or non-US, and EDGAR only covers US raises). Only an explicit status earns a
 * badge; everything else returns null and renders as "—".
 */
export function stageBadge(company: Company): StageBadge | null {
  if (company.status === 'Acquired') return { label: 'Acquired', tone: 'acquired', inferred: false }

  const stage = company.fundingStage
  if (!stage) return null

  const tone: StageTone =
    stage === 'Seed'
      ? 'seed'
      : stage === 'Series A'
        ? 'a'
        : stage === 'Series B'
          ? 'b'
          : 'c-plus'
  return { label: stage, tone, inferred: true }
}

/* ---- Growth -------------------------------------------------------------- */

/** Preferred window for headline growth, falling back as history allows. */
export function headlineGrowth(growth?: GrowthWindows): { key: string; window: GrowthWindow } | null {
  if (!growth) return null
  for (const key of ['d365', 'd180', 'd90', 'd30'] as const) {
    const window = growth[key]
    if (window) return { key, window }
  }
  return null
}

export const WINDOW_LABEL: Record<string, string> = {
  d30: '30d',
  d90: '90d',
  d180: '6M',
  d365: '12M',
}

/* ---- Momentum signals ----------------------------------------------------- */

export interface Signal {
  icon: string
  label: string
  tone: 'hot' | 'good' | 'info' | 'warn'
  title: string
}

const RECENT_FUNDING_DAYS = 120

function daysSince(iso?: string | null): number | null {
  if (!iso) return null
  const then = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

/**
 * Only signals that carry information. The spec's own rule — don't overuse
 * these — is enforced here rather than left to the caller: thresholds are set
 * so a badge means something happened, and small-base percentage moves are
 * excluded because 2 -> 5 employees is not a hiring story.
 */
export function signalsFor(company: Company, max = 2): Signal[] {
  const out: Signal[] = []

  const growth = headlineGrowth(company.growth)
  if (growth) {
    const { window } = growth
    const meaningful = window.from >= 10 && Math.abs(window.delta) >= 3
    if (meaningful && window.pct >= 40) {
      out.push({
        icon: '🔥',
        label: `Hiring fast +${Math.round(window.pct)}%`,
        tone: 'hot',
        title: `Headcount ${window.from} → ${window.to} over ${WINDOW_LABEL[growth.key]}`,
      })
    } else if (meaningful && window.pct >= 15) {
      out.push({
        icon: '↑',
        label: `Headcount +${Math.round(window.pct)}%`,
        tone: 'good',
        title: `Headcount ${window.from} → ${window.to} over ${WINDOW_LABEL[growth.key]}`,
      })
    } else if (meaningful && window.pct <= -15) {
      out.push({
        icon: '↓',
        label: `Headcount ${Math.round(window.pct)}%`,
        tone: 'warn',
        title: `Headcount ${window.from} → ${window.to} over ${WINDOW_LABEL[growth.key]}`,
      })
    }
  }

  const sinceRound = daysSince(company.lastRound?.date)
  if (sinceRound !== null && sinceRound <= RECENT_FUNDING_DAYS) {
    out.push({
      icon: '💰',
      label: 'Recently funded',
      tone: 'good',
      title: `${company.lastRound?.stage ?? 'Round'} filed ${sinceRound} days ago`,
    })
  }

  if (out.length === 0 && company.isHiring) {
    out.push({ icon: '·', label: 'Hiring', tone: 'info', title: 'Listed as hiring by Y Combinator' })
  }

  return out.slice(0, max)
}

/* ---- Momentum score ------------------------------------------------------- */

export function momentumBand(score: number): { label: string; tone: string } {
  if (score >= 40) return { label: 'Very high', tone: 'hot' }
  if (score >= 25) return { label: 'High', tone: 'good' }
  if (score >= 12) return { label: 'Moderate', tone: 'info' }
  if (score > 0) return { label: 'Low', tone: 'muted' }
  return { label: 'No signal', tone: 'muted' }
}
