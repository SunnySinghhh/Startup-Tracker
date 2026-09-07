"""SQLite schema — a *derived* query layer, never the source of truth.

Rebuilt from ``data/`` by ``tracker build``. Kept because SQL is far nicer than
Python loops for the momentum aggregations, and because it makes ad-hoc
exploration of the accumulated history easy.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS companies (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    one_liner           TEXT,
    long_description    TEXT,
    website             TEXT,
    sector              TEXT,
    sub_sector          TEXT,
    tags                TEXT,          -- JSON array
    hq_location         TEXT,
    regions             TEXT,          -- JSON array
    founded_date        TEXT,          -- ISO date
    status              TEXT,          -- Active / Acquired / Public / Inactive
    stage               TEXT,          -- Early / Growth
    batch               TEXT,          -- YC batch, NULL for custom entries
    logo_url            TEXT,
    profile_url         TEXT,
    origin              TEXT NOT NULL, -- 'yc' | 'custom'
    top_company         INTEGER DEFAULT 0,
    notes               TEXT,
    first_seen          TEXT,
    last_seen           TEXT
);
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_batch  ON companies(batch);

-- Time series. One row per company per observation day.
CREATE TABLE IF NOT EXISTS metric_snapshots (
    company_id          TEXT NOT NULL,
    snapshot_date       TEXT NOT NULL,
    headcount           INTEGER,
    is_hiring           INTEGER,
    github_stars        INTEGER,
    github_contributors INTEGER,
    github_commits_30d  INTEGER,
    github_forks        INTEGER,
    github_repos        INTEGER,
    press_mentions_30d  INTEGER,
    source              TEXT,
    PRIMARY KEY (company_id, snapshot_date),
    FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS idx_snap_date ON metric_snapshots(snapshot_date);

-- Event log: discrete things that happened.
CREATE TABLE IF NOT EXISTS signals (
    id                  TEXT PRIMARY KEY,
    company_id          TEXT NOT NULL,
    signal_type         TEXT NOT NULL,  -- funding|press|product|hiring|status_change|github
    signal_date         TEXT NOT NULL,
    title               TEXT,
    description         TEXT,
    source_url          TEXT,
    source_type         TEXT,           -- form_d|rss|yc|github
    FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS idx_signals_company ON signals(company_id, signal_date);
CREATE INDEX IF NOT EXISTS idx_signals_date    ON signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_signals_type    ON signals(signal_type);

CREATE TABLE IF NOT EXISTS funding_rounds (
    id                  TEXT PRIMARY KEY,
    company_id          TEXT NOT NULL,
    round_type          TEXT,
    amount_raised       REAL,
    currency            TEXT DEFAULT 'USD',
    announced_date      TEXT,
    lead_investor       TEXT,
    other_investors     TEXT,           -- JSON array
    source_url          TEXT,
    source_type         TEXT,           -- form_d|press|self_reported
    cik                 TEXT,
    accession_no        TEXT,
    round_type_inferred INTEGER DEFAULT 0,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS idx_funding_company ON funding_rounds(company_id, announced_date);

-- Computed by tracker.momentum; rebuilt on every run.
CREATE TABLE IF NOT EXISTS momentum (
    company_id          TEXT PRIMARY KEY,
    score               REAL,          -- ranking: observed evidence only
    score_available     REAL,          -- strength on measured components alone
    coverage            REAL,          -- fraction of total weight observed
    headcount_growth_90d REAL,
    headcount_delta_90d INTEGER,
    press_score         REAL,
    funding_recency     REAL,
    hiring_score        REAL,
    github_score        REAL,
    confidence          TEXT,           -- how much history backs the score
    computed_at         TEXT,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def reset(path: Path) -> sqlite3.Connection:
    """Drop and rebuild — the db is derived, so this is always safe."""
    for suffix in ("", "-wal", "-shm"):
        p = Path(str(path) + suffix)
        if p.exists():
            p.unlink()
    conn = connect(path)
    create_schema(conn)
    return conn
