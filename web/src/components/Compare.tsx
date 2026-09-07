/**
 * Side-by-side comparison of up to three companies.
 *
 * Each company gets its own small-multiple chart on a shared measure rather
 * than overlaying series on one plot — with headcounts that can differ by two
 * orders of magnitude, a single shared y-axis would flatten the small company
 * into the baseline.
 */

import type { Company, Meta } from '../data/types'
import { useDetail } from '../data/useData'
import { formatDate, initials, plain } from '../lib/format'
import { LineChart } from './LineChart'
import { MomentumBreakdown } from './Momentum'

interface Props {
  companies: Company[]
  meta: Meta
  onRemove: (id: string) => void
}

export function Compare({ companies, meta, onRemove }: Props) {
  if (companies.length === 0) {
    return (
      <div className="compare">
        <div className="empty">
          <div className="empty__title">Nothing to compare yet</div>
          <p className="empty__body">
            Open a company and choose <strong>+ Compare</strong> to add it here. Up to three at a
            time, shown as small multiples so each keeps its own scale.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="compare">
      <div className="compare__grid">
        {companies.map((company) => (
          <CompareCard key={company.id} company={company} meta={meta} onRemove={() => onRemove(company.id)} />
        ))}
        {companies.length < 3 && (
          <div className="compare__slot">
            Add another company from the directory to compare
            <br />
            <span style={{ color: 'var(--text-faint)' }}>{3 - companies.length} slot{companies.length === 2 ? '' : 's'} free</span>
          </div>
        )}
      </div>
    </div>
  )
}

function CompareCard({ company, meta, onRemove }: { company: Company; meta: Meta; onRemove: () => void }) {
  const { detail } = useDetail(company.id)

  const series = (detail?.history ?? [])
    .filter((h) => h.headcount != null)
    .map((h) => ({ date: h.date, value: h.headcount as number }))

  const growth = company.momentum?.components?.headcountGrowth != null
    ? (company.momentum.components.headcountDelta ?? 0)
    : null

  return (
    <div className="compare__card">
      <div className="company">
        {company.logo ? (
          <img className="company__logo" src={company.logo} alt="" />
        ) : (
          <div className="company__logo company__logo--fallback">{initials(company.name)}</div>
        )}
        <div className="company__text">
          <span className="company__name">{company.name}</span>
          <span className="company__tagline">{company.sector ?? ''}</span>
        </div>
        <button className="btn btn--ghost" onClick={onRemove} aria-label={`Remove ${company.name} from comparison`}>
          ✕
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat__label">Momentum</div>
          <div className="stat__value">{(company.momentum?.score ?? 0).toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Team</div>
          <div className={`stat__value${company.headcount ? '' : ' stat__value--muted'}`}>
            {company.headcount ? plain(company.headcount) : '—'}
          </div>
          {growth != null && (
            <div className={`stat__delta stat__delta--${growth > 0 ? 'up' : growth < 0 ? 'down' : 'flat'}`}>
              {growth > 0 ? '+' : ''}{growth} in 90d
            </div>
          )}
        </div>
        <div className="stat">
          <div className="stat__label">Signals</div>
          <div className={`stat__value${company.signalCount ? '' : ' stat__value--muted'}`}>
            {company.signalCount ?? '—'}
          </div>
        </div>
      </div>

      {series.length > 1 ? (
        <div>
          <h4 className="section-title">Headcount</h4>
          <LineChart points={series} label="Headcount" height={110} />
        </div>
      ) : (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          No trend yet — collecting since{' '}
          {meta.history.firstSnapshot ? formatDate(meta.history.firstSnapshot) : 'today'}.
        </p>
      )}

      <MomentumBreakdown momentum={company.momentum} />
    </div>
  )
}
