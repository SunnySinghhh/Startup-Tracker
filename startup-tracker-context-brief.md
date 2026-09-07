# Startup Tracker — Research Brief & Build Spec

*Context for building a personal "startup tracker" dashboard app in Claude Code.*

---

## Part 1: How VCs Actually Source Startups

VC sourcing splits into two broad traditions, and the best firms run both at once.

### 1. Relationship-based sourcing (the traditional model)
- **Warm intros and founder referrals** — the highest-conversion channel; funds actively ask portfolio founders to refer other founders.
- **Accelerators and demo days** — Y Combinator, Techstars, and sector-specific accelerators concentrate a batch of vetted early companies into one event.
- **Scout networks** — funds pay individual scouts (often operators or angels) small check sizes to surface deals in their own networks before the fund invests directly.
- **Conferences, university programs, founder communities** — slower, but a real source of proprietary (non-competitive) deal flow.
- **CRM/relationship-intelligence tools** — platforms like Affinity or 4Degrees mine a fund's email and calendar history to surface the "warmest path" to a target company. They only map a network the fund already has; they don't discover new companies.

### 2. Data-driven / signal-based sourcing (the fast-growing model)
This is the part most relevant to your app. Instead of waiting for a warm intro, firms now algorithmically watch for **leading signals** that a company is forming or about to raise, before it's publicly announced:
- New domain registrations tied to a founder's identity
- LinkedIn team formation (multiple hires at a stealth company in a short window)
- Hiring velocity by function, especially early engineering or GTM hires
- GitHub activity, patent filings, product launches
- Founder career moves out of notable companies ("spinout" signal)

Purpose-built platforms (Harmonic.ai, Specter, PredictLeads, Grata, SourceScrub) exist specifically to package these signals. A rough 2026 tech-stack pattern for institutional funds looks like:

| Layer | Example tools | Purpose |
|---|---|---|
| Relationship CRM | Affinity, 4Degrees | Track warm paths, tag deal flow |
| Signal/discovery | Harmonic, Specter, PredictLeads | Surface companies pre-announcement |
| Broad database | Crunchbase, PitchBook, Dealroom | Comps, market maps, later-stage financials |
| Portfolio monitoring | Visible, Juniper Square | Track their own investments post-check |

The key distinction worth internalizing: **leading signals** (hiring, engineering activity, team formation) give a fund a multi-week head start before a round is public; **lagging databases** (Crunchbase, PitchBook) simply record rounds *after* they're announced, with effectively zero lead time. Institutional-grade tools in this space are expensive — Harmonic runs roughly $12K–$50K/year, PitchBook contracts commonly land in the $12K–$70K range. That pricing reality matters for what's realistic in Part 3 below.

The honest takeaway for your project: **a startup tracker is, structurally, a lightweight version of what Harmonic/Specter do** — aggregate public signals into one dashboard so you can spot interesting companies and trends faster than reading the news reactively.

---

## Part 2: How Startups Work — What Actually Gets Tracked

### Funding lifecycle (quick recap)
Pre-seed → Seed → Series A → Series B/C/D+ → Exit (acquisition or IPO). Round size and expected traction/proof-points increase at each stage (see our earlier conversation for the full breakdown).

### The metrics categories VCs and trackers actually watch

**A. Funding data**
- Round type/stage, amount raised, date closed
- Pre-money and post-money valuation
- Lead investor + participating investors
- Cumulative capital raised to date
- Cap table / ownership dilution (harder to get publicly — usually only available for portfolio companies, not from public sources)

**B. Growth & traction metrics**
- Revenue: MRR/ARR, month-over-month or year-over-year growth rate
- Customer/user count, and change over time
- Retention/churn rate, net revenue retention
- Engagement metrics (DAU/MAU for consumer, usage frequency for B2B)

**C. Efficiency & financial health metrics**
- Customer acquisition cost (CAC), lifetime value (LTV), LTV:CAC ratio
- Burn rate and runway (months of cash left)
- Gross margin

**D. Team & hiring signals** (these are "leading" indicators, very trackable publicly)
- Headcount over time (LinkedIn employee count trend is the classic proxy)
- Hiring velocity by function — a spike in engineering or sales hiring often precedes a raise or a big push
- Executive hires (new CRO, VP Sales, etc. — often a growth-stage signal)
- Founder background (prior exits, notable companies, technical vs. commercial split)

**E. Product & technical signals**
- Product launch dates / major releases
- App store ranking and download trends (for consumer apps)
- GitHub activity (stars, commits, contributors — relevant for dev-tool or open-source-adjacent startups)
- Patent filings

**F. Market attention signals**
- Press mentions and their trend over time (spike = something happening)
- Web traffic trend (SimilarWeb-style estimates)
- Social media follower growth
- Review site presence/sentiment (G2, Capterra) for B2B software

**G. Ecosystem signals**
- Accelerator batch membership (YC, Techstars, etc.)
- Notable advisors or board members
- Awards, competition wins

The framing worth keeping in your head while designing the app: **funding stage and amount raised are lagging indicators** — they tell you something already happened. Headcount growth, hiring velocity, and press-mention spikes are **leading indicators** — they hint something is *about* to happen. A genuinely useful tracker surfaces both.

---

## Part 3: Spec & Context to Feed Claude Code

### Objective
Build a personal dashboard that ingests public startup data, stores it over time, and surfaces which companies are worth watching — going beyond a static "stage + amount raised" table into something that shows trajectory and momentum.

### Suggested data model

**`companies`**
`id, name, one_line_description, sector, sub_sector, hq_location, founded_date, website, status (active/acquired/shut down), notes, watchlist_flag`

**`founders`**
`id, company_id, name, linkedin_url, prior_companies, prior_exits (bool), role`

**`funding_rounds`**
`id, company_id, round_type (pre-seed/seed/A/B/...), amount_raised, currency, pre_money_valuation, post_money_valuation, announced_date, lead_investor, other_investors (list), source_url, source_type (Form D / press / self-reported)`

**`metric_snapshots`** *(time-series table — this is what makes it a "tracker" rather than a static list)*
`id, company_id, snapshot_date, headcount, headcount_change_30d, press_mention_count_30d, web_traffic_estimate, social_followers, metric_source`

**`signals`** *(event log)*
`id, company_id, signal_type (funding/hire/exec_hire/press/product_launch), signal_date, description, source_url`

A computed **"momentum score"** per company (e.g., weighted combination of recent headcount growth, press-mention spike, and time since last raise) is a nice v2 feature — it's the same logic tools like Harmonic sell, just simplified.

### Realistic data sources for a personal build
Enterprise tools (Harmonic, PitchBook, Affinity) are priced for funds, not personal projects — so lean on free/cheap public sources:

| Source | What it gives you | Cost | Notes |
|---|---|---|---|
| **SEC EDGAR Form D API** | Official U.S. filings for private capital raises — company, amount, some investor names, filing date | Free | Every U.S. company raising from investors must file this. No valuation data, no early formation signal (filed after the raise), and misses non-U.S. companies. Rate-limit to ~10 req/sec per SEC's own guidance. |
| **Crunchbase** | Broad company/funding database, editorial + crowd-sourced | Free tier is limited; paid API starts ~$49/mo (Basic) or ~$99/mo (Pro) | Good breadth, but data below Series A is often stale since it depends on self-reporting. |
| **Y Combinator public directory** | Full batch lists of YC companies | Free | Great seed-stage seed list to start your `companies` table with. |
| **TechCrunch / press RSS feeds** | Funding announcement text you can parse | Free | Good for the "signals" event log. |
| **LinkedIn (company pages)** | Headcount trend, hiring by function | No official free API for this use case | Be careful here — scraping LinkedIn directly violates its Terms of Service. If you want this signal, look into a compliant enrichment provider rather than building a scraper yourself. |

**A sensible MVP data pipeline:** pull Y Combinator's directory to seed your company list → periodically poll SEC EDGAR Form D for matching filings → parse a funding-news RSS feed for announcements/press signals → store everything in your `metric_snapshots` and `signals` tables so trends build up over time. Skip anything requiring scraping a site whose ToS forbids it.

### Suggested dashboard features (roughly MVP → later)
**MVP**
- Company list, filterable by sector and stage
- Per-company funding timeline (all rounds, amounts, investors)
- Cumulative capital raised chart
- A simple watchlist/starring feature

**V2**
- Headcount/hiring trend chart per company (once you've sourced that data compliantly)
- Press-mention frequency chart (spike detection)
- A composite "momentum score" and a sortable "what's heating up" view
- Alerts: notify when a watchlisted company files a new Form D or shows a hiring spike
- Side-by-side comparison view between 2–3 companies (echoing the comparable-company analysis we practiced earlier)

### Architecture notes for Claude Code
- Keep ingestion (data pulling) and presentation (dashboard) as separate concerns — a scheduled script/job that fetches and stores data, and a separate lightweight web app that reads from storage.
- SQLite is plenty for a personal project at this scale; only reach for Postgres if you expect to query it from multiple places or scale up.
- A simple stack that keeps this maintainable solo: a small Python (or Node) backend for scheduled ingestion + a lightweight web frontend (even a simple Flask/FastAPI + HTML/JS dashboard, or a React app) for the display layer.
- Build the `metric_snapshots` time-series table from day one, even if you only populate it with one field (headcount) at first — retrofitting time-series tracking later is much more painful than starting with it.

---

*Everything above is general knowledge plus current (2026) market context; pricing and tool names can shift, so worth a quick check before committing to a paid data source.*
