/**
 * Company profile: identity, KPI strip, what changed, headcount, funding,
 * trajectory, and comparable companies.
 *
 * Every metric carries its own freshness, because a startup directory is only
 * useful if you can tell whether you're looking at current information. Where
 * a value is unknown it reads "—" or says so plainly; nothing is filled in
 * with a plausible-looking default.
 */

import type { Company, Meta } from '../data/types'
import { useDetail } from '../data/useData'
import { similarCompanies } from '../lib/similar'
import { compactMoney, formatDate, plain, relativeDays } from '../lib/format'
import { WINDOW_LABEL, headlineGrowth } from '../lib/signals'
import { ChangeSummary } from './ChangeSummary'
import { FundingTimeline } from './FundingTimeline'
import { HeadcountChart } from './HeadcountChart'
import { MomentumScore, SignalTags, StageBadge } from './MomentumBadge'
import { WatchlistButton } from './WatchlistButton'

interface Props {
  company: Company
  meta: Meta
  allCompanies: Company[]
  onClose: () => void
  watched: boolean
  onToggleWatch: (id: string) => void
  onSelect: (id: string) => void
  onToggleCompare: (id: string) => void
  comparing: boolean
}

export function StartupProfile({
  company,
  meta,
  allCompanies,
  onClose,
  watched,
  onToggleWatch,
  onSelect,
  onToggleCompare,
  comparing,
}: Props) {
  const { detail, loading } = useDetail(company.id)
  const growth = headlineGrowth(company.growth)
  const similar = similarCompanies(company, allCompanies)

  const profileUrl =
    company.profileUrl ??
    (company.origin === 'yc' ? `${meta.ycProfilePrefix}${company.id.replace('yc:', '')}` : undefined)

  const location = company.city
    ? `${company.city}${company.country && company.country !== company.city ? `, ${company.country}` : ''}`
    : (company.country ?? null)

  return (
    <aside className="panel" aria-label={`${company.name} profile`}>
      <header className="panel__header">
        {company.logo ? (
          <img className="panel__logo" src={company.logo} alt="" />
        ) : (
          <div className="panel__logo" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="panel__title">{company.name}</h2>
          {company.tagline && <p className="panel__tagline">{company.tagline}</p>}
          <div className="panel__tags">
            <StageBadge company={company} />
            {company.sector && <span className="chip">{company.sector}</span>}
            {company.status && company.status !== 'Active' && (
              <span className="chip">{company.status}</span>
            )}
            <SignalTags company={company} max={2} />
          </div>
        </div>
        <WatchlistButton id={company.id} name={company.name} watched={watched} onToggle={onToggleWatch} />
        <button className="btn btn--ghost" onClick={onClose} aria-label="Close profile">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {/* KPI strip */}
      <section className="kpis">
        <Kpi label="Stage" value={company.fundingStage ?? null} note={company.fundingStage ? 'inferred' : 'no SEC filing'} />
        <Kpi
          label="Total raised"
          value={company.totalRaised ? compactMoney(company.totalRaised) : null}
          note={company.roundCount ? `${company.roundCount} filing${company.roundCount === 1 ? '' : 's'}` : 'not on record'}
          mono
        />
        <Kpi
          label="Employees"
          value={company.headcount != null ? plain(company.headcount) : null}
          note={company.headcountAsOf ? `as of ${relativeDays(company.headcountAsOf)}` : undefined}
          mono
        />
        <Kpi
          label={growth ? `${WINDOW_LABEL[growth.key]} growth` : '12M growth'}
          value={growth ? `${growth.window.pct >= 0 ? '+' : ''}${growth.window.pct.toFixed(0)}%` : null}
          note={growth ? `${growth.window.from} → ${growth.window.to}` : 'not enough history'}
          tone={growth ? (growth.window.pct >= 0 ? 'up' : 'down') : undefined}
          mono
        />
        <Kpi
          label="Last round"
          value={company.lastRound?.date ? relativeDays(company.lastRound.date) : null}
          note={company.lastRound?.date ? formatDate(company.lastRound.date) : 'none on record'}
        />
        <Kpi
          label="Momentum"
          value={<MomentumScore company={company} size="lg" />}
          note={`${Math.round((company.momentum?.coverage ?? 0) * 100)}% data coverage`}
        />
      </section>

      <div className="panel__actions">
        <button className={`btn${comparing ? ' btn--primary' : ''}`} onClick={() => onToggleCompare(company.id)}>
          {comparing ? '✓ In comparison' : '+ Compare'}
        </button>
        {company.website && (
          <a className="btn" href={company.website} target="_blank" rel="noopener noreferrer">
            Website ↗
          </a>
        )}
        {profileUrl && (
          <a className="btn" href={profileUrl} target="_blank" rel="noopener noreferrer">
            {company.origin === 'yc' ? 'YC profile ↗' : 'Profile ↗'}
          </a>
        )}
      </div>

      <section className="panel__section">
        <ChangeSummary company={company} signals={detail?.signals ?? []} />
      </section>

      <section className="panel__section">
        <h3 className="section-title">
          Headcount
          <SourceNote source="Y Combinator" updated={company.headcountAsOf} />
        </h3>
        {loading ? (
          <div className="skeleton" style={{ height: 140 }} />
        ) : (
          <HeadcountChart history={detail?.history ?? []} />
        )}
      </section>

      <section className="panel__section">
        <h3 className="section-title">
          Funding history
          <SourceNote source="SEC EDGAR Form D" />
        </h3>
        {detail && detail.funding.length > 0 ? (
          <div className="table-plain">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Round</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Lead investors</th>
                  <th style={{ textAlign: 'right' }}>Valuation</th>
                </tr>
              </thead>
              <tbody>
                {detail.funding.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{formatDate(r.date)}</td>
                    <td>
                      {r.round ?? '—'}
                      {r.roundInferred && <span className="badge__caveat" title="Inferred">?</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {r.amount ? compactMoney(r.amount) : '—'}
                    </td>
                    {/* Form D names no investors and carries no valuation. */}
                    <td className="cell--absent">Not in filing</td>
                    <td className="cell--absent" style={{ textAlign: 'right' }}>
                      —
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="footnote">
              Form D reports offering amounts only — it never names investors or states a
              valuation, so those columns stay empty rather than being filled from guesswork.
            </p>
          </div>
        ) : (
          <p className="muted-note">
            No SEC filings on record. That is not evidence the company hasn&apos;t raised: EDGAR
            covers US filings only, and early or non-US rounds often never appear.
          </p>
        )}
      </section>

      <section className="panel__section">
        <h3 className="section-title">Trajectory</h3>
        {loading ? (
          <div className="skeleton" style={{ height: 100 }} />
        ) : (
          <FundingTimeline
            founded={company.founded}
            batch={company.batch}
            history={detail?.history ?? []}
            funding={detail?.funding ?? []}
            signals={detail?.signals ?? []}
          />
        )}
      </section>

      <section className="panel__section">
        <h3 className="section-title">Profile</h3>
        <div className="meta-grid">
          <Meta label="Industry" value={company.sector} />
          <Meta label="Sub-industry" value={company.subSector} />
          <Meta label="Location" value={location} />
          <Meta label="Listed" value={company.founded ? formatDate(company.founded) : null} />
          <Meta label="Batch" value={company.batch ?? (company.origin === 'custom' ? 'Not YC' : null)} />
          <Meta label="Status" value={company.status} />
        </div>
        {company.tags && company.tags.length > 0 && (
          <div className="tag-row" style={{ marginTop: 'var(--space-4)' }}>
            {company.tags.map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
      </section>

      {similar.length > 0 && (
        <section className="panel__section">
          <h3 className="section-title">Similar companies</h3>
          <div className="similar">
            {similar.map(({ company: c, reasons }) => {
              const g = headlineGrowth(c.growth)
              return (
                <button className="similar__row" key={c.id} onClick={() => onSelect(c.id)}>
                  <span className="similar__name">{c.name}</span>
                  <span className="similar__meta">
                    {c.fundingStage ?? c.sector ?? '—'}
                    {c.headcount != null && ` · ${plain(c.headcount)} emp`}
                    {g && (
                      <span className={g.window.pct >= 0 ? 'is-up' : 'is-down'}>
                        {' · '}
                        {g.window.pct >= 0 ? '+' : ''}
                        {g.window.pct.toFixed(0)}%
                      </span>
                    )}
                  </span>
                  <span className="similar__why">{reasons.join(' · ')}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </aside>
  )
}

function Kpi({
  label,
  value,
  note,
  mono,
  tone,
}: {
  label: string
  value: React.ReactNode
  note?: string
  mono?: boolean
  tone?: 'up' | 'down'
}) {
  const missing = value == null || value === ''
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div
        className={`kpi__value${mono ? ' num' : ''}${missing ? ' kpi__value--absent' : ''}${
          tone ? ` is-${tone}` : ''
        }`}
      >
        {missing ? '—' : value}
      </div>
      {note && <div className="kpi__note">{note}</div>}
    </div>
  )
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="meta__label">{label}</div>
      <div className={`meta__value${value ? '' : ' cell--absent'}`}>{value ?? '—'}</div>
    </div>
  )
}

/** Subtle provenance, per the brief: a note rather than clutter. */
function SourceNote({ source, updated }: { source: string; updated?: string }) {
  return (
    <span
      className="source-note"
      title={`Source: ${source}${updated ? ` · updated ${formatDate(updated)}` : ''}`}
    >
      {source}
      {updated && ` · ${relativeDays(updated)}`}
    </span>
  )
}
