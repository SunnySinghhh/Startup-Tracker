/**
 * "What changed" over a chosen window — the product's headline question.
 *
 * Only changes we can actually evidence appear. Several things the brief asks
 * for (open-role counts, leadership hires, product launches) have no source in
 * this pipeline, so rather than invent them the section states what it can see
 * and stays silent on the rest. A row that reads "Open roles 7 → 19" when
 * nothing measured that would be worse than no row at all.
 */

import { useState } from 'react'
import type { Company, Signal } from '../data/types'
import { compactMoney, formatDate, plain, relativeDays } from '../lib/format'

const WINDOWS = [
  { key: 'd30', label: '30 days', days: 30 },
  { key: 'd90', label: '90 days', days: 90 },
  { key: 'd180', label: '180 days', days: 180 },
] as const

export function ChangeSummary({ company, signals }: { company: Company; signals: Signal[] }) {
  const available = WINDOWS.filter((w) => company.growth?.[w.key])
  const [windowKey, setWindowKey] = useState(() => available[1]?.key ?? available[0]?.key ?? 'd90')

  const active = WINDOWS.find((w) => w.key === windowKey) ?? WINDOWS[1]
  const growth = company.growth?.[active.key]

  const cutoff = Date.now() - active.days * 86_400_000
  const withinWindow = (iso?: string | null) => {
    if (!iso) return false
    const t = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()
    return Number.isFinite(t) && t >= cutoff
  }

  const newRound = withinWindow(company.lastRound?.date) ? company.lastRound : null
  const recentSignals = signals.filter((s) => withinWindow(s.date))

  const hasAnything = growth || newRound || recentSignals.length > 0

  return (
    <div>
      <div className="section-head">
        <h3 className="section-title" style={{ marginBottom: 0 }}>
          What changed
        </h3>
        {available.length > 1 && (
          <div className="rangebar" role="group" aria-label="Change window">
            {available.map((w) => (
              <button
                key={w.key}
                className="rangebar__btn"
                aria-pressed={windowKey === w.key}
                onClick={() => setWindowKey(w.key)}
              >
                {w.days}d
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasAnything ? (
        <p className="muted-note">
          Nothing measurable changed in this window. Headcount is recorded when it moves, so no
          entry here means it held steady — not that the company was unobserved.
        </p>
      ) : (
        <div className="changes">
          {growth && (
            <div className="change">
              <div className="change__label">Employees</div>
              <div className="change__values num">
                {plain(growth.from)} <span className="change__arrow">→</span> {plain(growth.to)}
              </div>
              <div className={`change__pct ${growth.pct >= 0 ? 'is-up' : 'is-down'}`}>
                {growth.pct >= 0 ? '+' : ''}
                {growth.pct.toFixed(0)}%
              </div>
              {growth.stale && (
                <div className="change__note" title={`Reading from ${growth.anchorDate}`}>
                  based on a {growth.anchorAgeDays}-day-old reading
                </div>
              )}
            </div>
          )}

          {newRound && (
            <div className="change">
              <div className="change__label">Funding</div>
              <div className="change__values">
                {newRound.amount ? compactMoney(newRound.amount) : 'Filed'}{' '}
                {newRound.stage && <span className="change__arrow">{newRound.stage}</span>}
              </div>
              <div className="change__pct is-up">{relativeDays(newRound.date)}</div>
              <div className="change__note">SEC Form D · {formatDate(newRound.date)}</div>
            </div>
          )}

          {recentSignals.length > 0 && (
            <div className="change">
              <div className="change__label">Press</div>
              <div className="change__values num">{recentSignals.length}</div>
              <div className="change__pct">
                mention{recentSignals.length === 1 ? '' : 's'}
              </div>
              <div className="change__note">{recentSignals[0]?.title?.slice(0, 60)}</div>
            </div>
          )}
        </div>
      )}

      <p className="footnote" style={{ marginTop: 'var(--space-3)' }}>
        Open-role counts, leadership hires and product launches aren&apos;t tracked — no free source
        provides them reliably, so they are omitted rather than estimated.
      </p>
    </div>
  )
}
