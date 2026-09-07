/** Company detail panel: metadata, momentum breakdown, trends, signal log. */

import type { Company, Meta } from '../data/types'
import { useDetail } from '../data/useData'
import { formatDate, money, plain, relativeDays } from '../lib/format'
import { LineChart } from './LineChart'
import { MomentumBreakdown } from './Momentum'

/** Signal colours always ship beside a text label, never as colour alone. */
const SIGNAL_COLOR: Record<string, string> = {
  funding: 'var(--series-4)',
  press: 'var(--series-2)',
  product: 'var(--series-1)',
  hiring: 'var(--series-3)',
  github: 'var(--series-5)',
}

interface Props {
  company: Company
  meta: Meta
  onClose: () => void
  watched: boolean
  onToggleWatch: () => void
}

export function CompanyPanel({ company, meta, onClose, watched, onToggleWatch }: Props) {
  const { detail, loading } = useDetail(company.id)

  const profileUrl =
    company.profileUrl ??
    (company.origin === 'yc' ? `${meta.ycProfilePrefix}${company.id.replace('yc:', '')}` : undefined)

  const headcountSeries = (detail?.history ?? [])
    .filter((h) => h.headcount != null)
    .map((h) => ({ date: h.date, value: h.headcount as number }))

  const starsSeries = (detail?.history ?? [])
    .filter((h) => h.githubStars != null)
    .map((h) => ({ date: h.date, value: h.githubStars as number }))

  return (
    <aside className="panel" aria-label={`${company.name} details`}>
      <header className="panel__header">
        {company.logo ? (
          <img className="panel__logo" src={company.logo} alt="" />
        ) : (
          <div className="panel__logo" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="panel__title">{company.name}</h2>
          {company.tagline && <p className="panel__tagline">{company.tagline}</p>}
        </div>
        <button className="btn btn--ghost" onClick={onClose} aria-label="Close details">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="panel__section" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button className={`btn${watched ? ' btn--primary' : ''}`} onClick={onToggleWatch}>
          {watched ? '★ Watching' : '☆ Watch'}
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
        <h3 className="section-title">Momentum</h3>
        <MomentumBreakdown momentum={company.momentum} />
      </section>

      <section className="panel__section">
        <h3 className="section-title">Profile</h3>
        <div className="meta-grid">
          <Meta label="Sector" value={company.sector} />
          <Meta label="Sub-sector" value={company.subSector} />
          <Meta label="Stage" value={company.stage} />
          <Meta label="Status" value={company.status} />
          <Meta label="Batch" value={company.batch ?? (company.origin === 'custom' ? 'Not YC' : undefined)} />
          <Meta label="Team size" value={company.headcount ? plain(company.headcount) : undefined} mono />
          <Meta label="Location" value={company.location} />
          <Meta label="Launched" value={company.founded ? formatDate(company.founded) : undefined} />
        </div>

        {company.tags && company.tags.length > 0 && (
          <div className="tag-row" style={{ marginTop: 'var(--space-4)' }}>
            {company.tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {company.notes && (
          <div className="notice" style={{ marginTop: 'var(--space-4)' }}>
            <div>{company.notes}</div>
          </div>
        )}
      </section>

      <section className="panel__section">
        <h3 className="section-title">
          Headcount trend
          {headcountSeries.length > 1 && (
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {headcountSeries.length} observations
            </span>
          )}
        </h3>
        {headcountSeries.length > 1 ? (
          <LineChart points={headcountSeries} label="Headcount" />
        ) : (
          <ColdStart
            current={company.headcount}
            spanDays={meta.history.spanDays}
            firstSnapshot={meta.history.firstSnapshot}
          />
        )}
      </section>

      {starsSeries.length > 1 && (
        <section className="panel__section">
          <h3 className="section-title">GitHub stars</h3>
          <LineChart points={starsSeries} label="Stars" color="var(--series-5)" />
        </section>
      )}

      {detail && detail.funding.length > 0 && (
        <section className="panel__section">
          <h3 className="section-title">
            Funding
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {detail.funding.length} SEC filing{detail.funding.length === 1 ? '' : 's'}
            </span>
          </h3>

          {detail.funding.map((round) => (
            <div className="signal" key={round.id}>
              <span className="signal__dot" style={{ background: SIGNAL_COLOR.funding }} />
              <div>
                <div className="signal__head">
                  <span className="chip">
                    {round.round ?? 'Round'}
                    {round.roundInferred ? '?' : ''}
                  </span>
                  <span className="signal__date">{formatDate(round.date)}</span>
                  {round.url && (
                    <a
                      className="signal__date"
                      href={round.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)' }}
                    >
                      filing ↗
                    </a>
                  )}
                </div>
                <div className="signal__title">
                  {round.amount != null
                    ? money(round.amount, round.currency ?? 'USD')
                    : 'Amount not disclosed in filing index'}
                  {round.lead ? ` · led by ${round.lead}` : ''}
                </div>
              </div>
            </div>
          ))}

          <div className="notice" style={{ marginTop: 'var(--space-3)' }}>
            <div>
              <strong>Form D filings, not announced rounds.</strong> A stage marked{' '}
              <span className="chip">Series X?</span> is <em>inferred from filing order</em> — Form D
              never states the round name. Amounts are absent because the SEC full-text index
              doesn&apos;t carry them; open a filing to read the offering total.
            </div>
          </div>
        </section>
      )}

      <section className="panel__section">
        <h3 className="section-title">
          Signal log
          {detail && detail.signals.length > 0 && (
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {detail.signals.length}
            </span>
          )}
        </h3>
        {loading && <div className="skeleton" style={{ height: 64 }} />}
        {!loading && (!detail || detail.signals.length === 0) && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
            No signals recorded yet. Press mentions are matched conservatively — only
            high-confidence name matches are kept, so quiet companies genuinely show nothing here.
          </p>
        )}
        {!loading &&
          detail?.signals.map((signal) => (
            <article className="signal" key={signal.id}>
              <span
                className="signal__dot"
                style={{ background: SIGNAL_COLOR[signal.type] ?? 'var(--text-faint)' }}
              />
              <div>
                <div className="signal__head">
                  <span className="chip chip--dot" style={{ color: SIGNAL_COLOR[signal.type] }}>
                    {signal.type}
                  </span>
                  <span className="signal__date">
                    {formatDate(signal.date)} · {relativeDays(signal.date)}
                  </span>
                </div>
                {signal.url ? (
                  <a className="signal__title" href={signal.url} target="_blank" rel="noopener noreferrer">
                    {signal.title}
                  </a>
                ) : (
                  <div className="signal__title">{signal.title}</div>
                )}
                {signal.description && <p className="signal__desc">{signal.description}</p>}
              </div>
            </article>
          ))}
      </section>
    </aside>
  )
}

function Meta({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <div className="meta__label">{label}</div>
      <div className={`meta__value${mono ? ' num' : ''}`} style={!value ? { color: 'var(--text-faint)' } : undefined}>
        {value ?? '—'}
      </div>
    </div>
  )
}

/**
 * The honest empty state for the time series.
 *
 * On a fresh install there is exactly one observation per company, so there is
 * nothing to plot. Rather than render an empty axis, say what's happening and
 * when it will fill in — the tracker only becomes a tracker once the scheduled
 * job has been running for a while.
 */
function ColdStart({
  current,
  spanDays,
  firstSnapshot,
}: {
  current?: number
  spanDays: number
  firstSnapshot: string | null
}) {
  return (
    <div>
      {current != null && (
        <div className="stats" style={{ marginBottom: 'var(--space-3)' }}>
          <div className="stat">
            <div className="stat__label">Current team size</div>
            <div className="stat__value">{plain(current)}</div>
          </div>
        </div>
      )}
      <div className="notice">
        <div>
          <strong>Building history.</strong> Trend charts need at least two observations.
          {firstSnapshot
            ? ` Collection started ${formatDate(firstSnapshot)} (${spanDays} day${spanDays === 1 ? '' : 's'} so far)`
            : ' No snapshots recorded yet'}
          — the scheduled job adds one point per company per day, so this chart fills in on its own.
        </div>
      </div>
    </div>
  )
}
