/**
 * "What's heating up" — companies ranked by momentum.
 *
 * This view is the one most affected by the cold start, so it leads with an
 * explicit statement of how much history backs the ranking instead of
 * presenting a confident-looking leaderboard built on a single day of data.
 */

import type { Company, Meta } from '../data/types'
import { formatDate, initials, plain } from '../lib/format'
import { MomentumBar } from './Momentum'

interface Props {
  companies: Company[]
  meta: Meta
  onSelect: (company: Company) => void
}

export function HeatingUp({ companies, meta, onSelect }: Props) {
  const ranked = companies
    .filter((c) => (c.momentum?.score ?? 0) > 0)
    .sort((a, b) => (b.momentum?.score ?? 0) - (a.momentum?.score ?? 0))
    .slice(0, 100)

  const spanDays = meta.history.spanDays
  const thin = spanDays < 14

  return (
    <div className="heat">
      {thin && (
        <div className="notice">
          <div>
            <strong>
              {spanDays === 0
                ? 'First day of collection.'
                : `${spanDays} day${spanDays === 1 ? '' : 's'} of history so far.`}
            </strong>{' '}
            Headcount growth carries the most weight in the momentum score but needs a trend to
            compute, so today's ranking leans on press activity and hiring signals. It gets
            meaningfully better once the scheduled job has run for a few weeks.
          </div>
        </div>
      )}

      <div className="stats">
        <Stat label="Companies tracked" value={plain(meta.counts.companies)} />
        <Stat label="Signals logged" value={plain(meta.counts.signals)} />
        <Stat label="Actively hiring" value={plain(meta.counts.hiring)} />
        <Stat label="Observations" value={plain(meta.counts.snapshots)} />
        <Stat
          label="Collecting since"
          value={meta.history.firstSnapshot ? formatDate(meta.history.firstSnapshot) : '—'}
          small
        />
      </div>

      {ranked.length === 0 ? (
        <div className="empty">
          <div className="empty__title">No momentum signals yet</div>
          <p className="empty__body">
            Nothing has scored above zero. Run the ingest job to pull press signals and headcount,
            then check back as history accumulates.
          </p>
        </div>
      ) : (
        <div>
          <h3 className="section-title">
            Top {ranked.length} by momentum
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              scored out of {plain(companies.length)} in view
            </span>
          </h3>
          <div className="heat__list">
            {ranked.map((company, index) => (
              <div className="heat__item" key={company.id} onClick={() => onSelect(company)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(company) }}>
                <span className="heat__rank">{index + 1}</span>
                <div className="company">
                  {company.logo ? (
                    <img className="company__logo" src={company.logo} alt="" loading="lazy" />
                  ) : (
                    <div className="company__logo company__logo--fallback">{initials(company.name)}</div>
                  )}
                  <div className="company__text">
                    <span className="company__name">{company.name}</span>
                    <span className="company__tagline">
                      {company.tagline ?? company.sector ?? ''}
                    </span>
                  </div>
                </div>
                <div className="mbar-wrap">
                  <MomentumBar momentum={company.momentum} height={8} />
                </div>
                <span className="heat__score">{(company.momentum?.score ?? 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value" style={small ? { fontSize: 'var(--text-md)' } : undefined}>
        {value}
      </div>
    </div>
  )
}
