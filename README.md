# Signal — a personal startup tracker

A dashboard that watches ~6,200 startups for *leading* signals — headcount
growth, hiring activity, press mentions, SEC filings, GitHub activity — and
ranks what's heating up.

It runs entirely on free public data, costs nothing to operate, and deploys to
GitHub Pages. A scheduled GitHub Action appends one observation per company per
day, so the history it reasons over accumulates on its own.

**Live dashboard:** <https://sunnysinghhh.github.io/Startup-Tracker/>

---

## Why this exists

Funding databases like Crunchbase and PitchBook are **lagging** — they record a
round after it's announced, with effectively zero lead time. The tools that give
funds a real head start (Harmonic, Specter) watch **leading** signals instead:
teams forming, hiring accelerating, engineering activity spiking. They cost
$12k–$50k a year.

This is a small, honest version of that idea: aggregate public leading signals
into one place, and be explicit about how much you actually know.

## What it tracks

| Signal | Source | Type | Cost |
|---|---|---|---|
| Company directory, sector, status | [YC public directory](https://github.com/yc-oss/api) | Dimension | Free |
| **Headcount over time** | YC `team_size`, snapshotted daily | **Leading** | Free |
| **Actively hiring** | YC `isHiring` flag | **Leading** | Free |
| **Press mentions** | TechCrunch RSS | **Leading** | Free |
| Private funding filings | SEC EDGAR Form D | Lagging | Free |
| **GitHub stars / repos** | GitHub REST API | **Leading** | Free |
| Non-YC companies | `data/custom-companies.json`, hand-curated | Dimension | Free |

Headcount is the signal that usually requires scraping LinkedIn — which
violates its terms of service. YC publishes `team_size` for 5,962 of its
companies, so snapshotting that daily gives a legitimate headcount time series
without touching LinkedIn at all.

## Architecture

```
 sources ──▶ data/ (JSONL, in git) ──▶ SQLite (derived) ──▶ static JSON ──▶ React app
   │              │                        │                    │
 scheduled    append-only,             rebuilt from        read by the
 GitHub       the source of            scratch each        Pages site
 Action       truth                    run
```

Two decisions are worth calling out.

**Append-only JSONL is the source of truth, not SQLite.** The scheduled job
commits its output, and git stores a full copy of every binary file version — a
5 MB database committed daily becomes ~1.8 GB of history in a year. JSONL
snapshots partitioned by month produce clean append-only diffs instead. SQLite
is rebuilt from them on demand and is gitignored.

**Ingestion never computes anything.** It writes raw observations only. When the
scoring model changes you re-run `build`, not `ingest`, so no history is lost or
retroactively rewritten.

```
pipeline/          Python ingestion + scoring
  tracker/
    sources/       one module per data source
    momentum.py    the scoring model
    export.py      SQLite -> static JSON
data/              committed: the observation history
web/               React + TypeScript dashboard
.github/workflows/ scheduled ingest, Pages deploy, CI
```

## The momentum score

A 0–100 weighted blend of leading signals:

| Component | Weight | Needs |
|---|---|---|
| Headcount growth (90d) | 0.35 | ≥2 observations |
| Press activity (30d) | 0.25 | a matched mention |
| Actively hiring | 0.15 | available day one |
| Funding recency | 0.15 | a filing or announcement |
| GitHub activity (90d) | 0.10 | a declared org |

**Missing data scores zero rather than being renormalised away.** That choice
matters. Renormalising over available components gave every hiring company a
score of exactly 100 on a fresh install — 1,477 companies tied, ranking
meaningless. Scoring on *observed evidence* means a company can't claim momentum
we haven't seen.

Because that conflates "quiet" with "not yet measured", every score also
reports `coverage` (what fraction of the weighting is backed by real data) and
`confidence`. The UI shows the full component breakdown, so any score is
traceable to its inputs.

> **On a fresh install the score is mostly uninformative, and the dashboard says
> so.** Headcount growth is the heaviest component and needs weeks of history.
> This is inherent to building a time series from scratch, not a defect.

## Quick start

```bash
# 1. Pipeline
cd pipeline
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# SEC requires a contact address in the User-Agent, and blocks traffic without one
export TRACKER_CONTACT_EMAIL="you@example.com"

python -m tracker.cli all          # ingest + build + export
python -m tracker.cli all --edgar --github   # include per-company enrichment

# 2. Dashboard
cd ../web
npm install
npm run dev
```

## Deploying to GitHub Pages

1. Push to GitHub (public repo, or private with Pages enabled).
2. **Settings → Pages → Build and deployment → Source: `GitHub Actions`.**
   If this is left as "Deploy from a branch", GitHub runs its built-in Jekyll
   job and serves a rendered README instead of the dashboard, and the
   `deploy-pages` step of the deploy workflow fails.
3. **Settings → Secrets and variables → Actions → Variables →** add
   `TRACKER_CONTACT_EMAIL` with your email. SEC blocks requests without it.
4. Push to `main`, or run the **Deploy dashboard** workflow manually.

`ingest.yml` then runs daily at 06:15 UTC and commits new observations.

## Adding companies outside YC

Edit [`data/custom-companies.json`](data/custom-companies.json). Only `name` is
required; everything else renders as unknown rather than breaking:

```json
{
  "name": "Anthropic",
  "one_liner": "AI safety and research company",
  "website": "https://anthropic.com",
  "sector": "B2B",
  "github_org": "anthropics"
}
```

They flow through the same pipeline and UI as YC companies, tagged `Non-YC`.

## Honest limitations

Worth knowing before trusting anything here:

- **The time series starts empty.** Momentum is weak until the scheduled job has
  run for several weeks. Nothing can shortcut this.
- **Press matching favours precision over recall.** Matching 6,200 company names
  against headlines is a false-positive machine — YC has companies called Bond,
  Grid, Pave and Stage. The matcher requires case-sensitive word-boundary
  matches, rejects investor firms (`Cherry` vs `Cherry Ventures`), and demands
  nearby funding vocabulary for dictionary-word names. It misses real mentions.
- **Form D matching is stricter still.** The entity name must reduce exactly to
  the company name. Looser matching attributed 19 syndicate SPVs to Anthropic
  and surgical-products companies to Linear. The cost is real misses — Rippling
  files as "Rippling People Center Inc." and won't match. Pin those by hand in
  `data/edgar-cik-overrides.json`.
- **Form D round labels are inferred** from filing order; the filing never
  states a round name. The UI marks these with `?`.
- **Form D carries no amounts** in the SEC full-text index, and no valuations
  ever. Non-US companies never appear.
- **YC `launched_at` is a listing date**, not an incorporation date.
- **GitHub orgs are never guessed** from company names — too many unrelated orgs
  collide. Declare them in `data/github-orgs.json`.
- **The watchlist lives in your browser.** A static site can't write back to the
  repo. `data/watchlist.json` separately drives pipeline enrichment priority.

## Testing

```bash
cd pipeline && pytest -q && ruff check .
cd ../web && npm run typecheck
```

The test suite concentrates on the two places that produce *confidently wrong*
data if they break: entity matching and the momentum model's handling of missing
data.

## Docs

- [docs/DESIGN.md](docs/DESIGN.md) — design system, palette validation, data-viz rules
