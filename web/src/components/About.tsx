/**
 * The explainer.
 *
 * A tracker that shows scores without explaining them is asking for trust it
 * hasn't earned. This page states where every number comes from, how the score
 * is computed, and — most importantly — what the data cannot tell you.
 */

import type { Meta } from '../data/types'
import { formatDate, plain } from '../lib/format'

const SOURCES = [
  {
    name: 'Y Combinator directory',
    gives: 'Company list, sector, status, team size, hiring flag',
    kind: 'Leading',
    note: 'One request returns the whole batch history, so the full universe refreshes daily for free.',
  },
  {
    name: 'YC team_size, snapshotted',
    gives: 'Headcount over time',
    kind: 'Leading',
    note: 'The compliant substitute for LinkedIn headcount, which cannot be scraped without violating its terms.',
  },
  {
    name: 'TechCrunch RSS',
    gives: 'Press mentions and funding chatter',
    kind: 'Leading',
    note: 'Matched to companies conservatively — see matching below.',
  },
  {
    name: 'SEC EDGAR Form D',
    gives: 'US private funding filings and dollar amounts',
    kind: 'Lagging',
    note: 'Amounts come from each filing’s XML; the search index alone carries none.',
  },
  {
    name: 'GitHub REST API',
    gives: 'Stars, forks, public repo counts',
    kind: 'Leading',
    note: 'Only for companies with a declared org — never guessed from a name.',
  },
]

const WEIGHTS = [
  ['Headcount growth (90d)', 0.35, 'Needs at least two observations', 'var(--series-1)'],
  ['Press activity (30d)', 0.25, 'Weighted by match confidence', 'var(--series-2)'],
  ['Actively hiring', 0.15, 'Available from day one', 'var(--series-3)'],
  ['Funding recency', 0.15, 'Decays over ~18 months', 'var(--series-4)'],
  ['GitHub activity (90d)', 0.1, 'Only where an org is declared', 'var(--series-5)'],
] as const

export function About({ meta }: { meta: Meta }) {
  return (
    <div className="page page--prose">
      <header className="page__head">
        <div>
          <h1 className="page__title">How this works</h1>
          <p className="page__lede">
            Every number here comes from a free, public source, collected on a schedule. This page
            explains what is measured, how it is scored, and where it falls short.
          </p>
        </div>
      </header>

      <section className="prose">
        <h2>The idea</h2>
        <p>
          Funding databases are <em>lagging</em> — they record a round after it is announced, which
          is useful history but gives no head start. The tools funds pay heavily for watch{' '}
          <em>leading</em> signals instead: teams forming, hiring accelerating, engineering activity
          spiking. This is a small version of that idea built entirely on public data.
        </p>
        <p>
          The distinction runs through the whole project. A funding filing tells you something
          already happened. A hiring spike hints something is about to.
        </p>

        <h2>Where the data comes from</h2>
        <div className="table-plain">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>What it gives</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.name}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="table-plain__note">{s.note}</div>
                  </td>
                  <td>{s.gives}</td>
                  <td>
                    <span className={`chip ${s.kind === 'Leading' ? 'chip--accent' : 'chip--muted'}`}>
                      {s.kind}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="prose__aside">
          Scope is Y Combinator companies from 2019 onward, plus any company added by hand. Older
          batches are mostly exited or dormant, and excluding them keeps the dataset focused.
        </p>

        <h2>The momentum score</h2>
        <p>
          A 0–100 blend of the signals above. Each contributes up to its weight:
        </p>
        <div className="weights">
          {WEIGHTS.map(([label, weight, note, color]) => (
            <div className="weights__row" key={label}>
              <span className="weights__swatch" style={{ background: color }} />
              <span className="weights__label">
                {label}
                <span className="weights__note">{note}</span>
              </span>
              <span className="weights__bar">
                <span className="weights__fill" style={{ width: `${weight * 100}%`, background: color }} />
              </span>
              <span className="weights__value">{weight.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <h3>Why a missing signal scores zero</h3>
        <p>
          This is the one design decision worth understanding, because it shapes every ranking on
          the site.
        </p>
        <p>
          The obvious approach is to renormalise: if only two of five components have data, score
          on those two and scale up. That collapses immediately. On a fresh install the only
          available signal is the hiring flag, so every hiring company scores exactly 100 — over a
          thousand companies tied, and a ranking carrying no information at all.
        </p>
        <p>
          So a company is scored on the evidence actually observed. It cannot claim momentum we
          haven&apos;t seen. That deliberately conflates &ldquo;quiet&rdquo; with &ldquo;not yet
          measured&rdquo;, so every score also reports its <strong>coverage</strong> — the share of
          the weighting backed by real data — and each company page breaks the score down
          component by component, marking anything unmeasured as such rather than as a zero.
        </p>

        <h2>How companies are matched</h2>
        <p>
          Attributing a headline or a funding filing to the wrong company produces confidently
          wrong data, which is worse than a gap. Both matchers therefore trade recall for
          precision, and both were wrong before they were right.
        </p>
        <h3>Press</h3>
        <p>
          Matching thousands of company names against headlines is a false-positive machine — YC
          alone has companies called Bond, Grid, Pave and Stage. Matches must be case-sensitive and
          on word boundaries; investor firms are rejected (a mention of <em>Cherry Ventures</em> is
          not the company Cherry); and dictionary-word names must appear in the headline{' '}
          <em>next to</em> funding vocabulary, not merely somewhere in the article.
        </p>
        <h3>SEC filings</h3>
        <p>
          Stricter still: the filing entity&apos;s name must reduce exactly to the company name once
          legal suffixes are stripped. Looser prefix matching attributed nineteen syndicate SPVs to
          one company — vehicles that invest <em>in</em> it — and matched a surgical-products firm
          to a software company sharing a prefix. The cost is real misses, since plenty of startups
          file under a longer legal name; those can be pinned by CIK by hand.
        </p>

        <h2>What this cannot tell you</h2>
        <ul className="limits">
          <li>
            <strong>The history starts empty.</strong> Momentum is weak until the daily job has run
            for weeks. Nothing shortcuts this.
            {meta.history.firstSnapshot && (
              <> Collection began {formatDate(meta.history.firstSnapshot)}.</>
            )}
          </li>
          <li>
            <strong>Round labels are inferred.</strong> Form D never states a round name, so stages
            are estimated from amount and filing order.
          </li>
          <li>
            <strong>No valuations, anywhere.</strong> Form D does not carry them and no free source
            does reliably.
          </li>
          <li>
            <strong>US filings only.</strong> Non-US companies never appear in EDGAR, so their
            funding view will be empty regardless of what they have raised.
          </li>
          <li>
            <strong>Press coverage is one outlet.</strong> A company can be active and simply not
            covered by the feeds being read.
          </li>
          <li>
            <strong>Headcount is YC&apos;s own figure</strong>, updated at its own cadence, not a
            live count.
          </li>
          <li>
            <strong>Absence is not evidence.</strong> An empty cell or a zero score frequently means
            &ldquo;not measured&rdquo;, not &ldquo;nothing happened&rdquo;.
          </li>
        </ul>

        <h2>How it runs</h2>
        <p>
          A scheduled job fetches every source once a day, appends the new observations, and commits
          them. Ingestion only ever writes raw observations — it never computes derived values — so
          changing the scoring model re-scores history rather than rewriting it.
        </p>
        <p>
          The site itself is static. Everything you see was built from the committed data at deploy
          time, which is why it loads a single dataset and then filters instantly in the browser.
        </p>
        <p className="prose__aside">
          Last updated {meta.generatedAt ? formatDate(meta.generatedAt) : 'unknown'} ·{' '}
          {plain(meta.counts.snapshots)} observations recorded ·{' '}
          <a href="https://github.com/SunnySinghhh/Startup-Tracker" target="_blank" rel="noopener noreferrer">
            source on GitHub
          </a>
        </p>
      </section>
    </div>
  )
}
