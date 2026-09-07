"""Rebuild the derived SQLite database from data/.

Always a full rebuild from scratch. The database holds no information that
isn't in ``data/``, so throwing it away and re-reading is simpler, faster at
this scale, and impossible to get subtly out of sync.
"""

from __future__ import annotations

import json
import logging
from datetime import date

from . import db, momentum, paths, store

log = logging.getLogger(__name__)

_COMPANY_COLUMNS = (
    "id", "name", "one_liner", "long_description", "website", "sector", "sub_sector",
    "tags", "hq_location", "regions", "founded_date", "status", "stage", "batch",
    "logo_url", "profile_url", "origin", "top_company", "notes", "first_seen", "last_seen",
)


def _load_companies(conn) -> int:
    companies = store.read_json(paths.COMPANIES, default=[])
    rows = []
    for c in companies:
        row = []
        for col in _COMPANY_COLUMNS:
            value = c.get(col)
            if col in ("tags", "regions"):
                value = json.dumps(value or [], ensure_ascii=False)
            row.append(value)
        rows.append(tuple(row))

    placeholders = ",".join("?" * len(_COMPANY_COLUMNS))
    conn.executemany(
        f"INSERT OR REPLACE INTO companies ({','.join(_COMPANY_COLUMNS)}) "
        f"VALUES ({placeholders})",
        rows,
    )
    return len(rows)


def _load_snapshots(conn) -> int:
    known = {r["id"] for r in conn.execute("SELECT id FROM companies")}
    rows = [
        (
            s["company_id"], s["snapshot_date"], s.get("headcount"), s.get("is_hiring"),
            s.get("github_stars"), s.get("github_contributors"), s.get("github_commits_30d"),
            s.get("github_forks"), s.get("github_repos"),
            s.get("press_mentions_30d"), s.get("source"),
        )
        for s in store.read_all(paths.SNAPSHOTS)
        if s.get("company_id") in known
    ]
    conn.executemany(
        """INSERT OR REPLACE INTO metric_snapshots
           (company_id, snapshot_date, headcount, is_hiring, github_stars,
            github_contributors, github_commits_30d, github_forks, github_repos,
            press_mentions_30d, source)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    return len(rows)


def _load_signals(conn) -> int:
    known = {r["id"] for r in conn.execute("SELECT id FROM companies")}
    rows = [
        (
            s["id"], s["company_id"], s["signal_type"], s["signal_date"], s.get("title"),
            s.get("description"), s.get("source_url"), s.get("source_type"),
        )
        for s in store.read_all(paths.SIGNALS)
        if s.get("company_id") in known
    ]
    conn.executemany(
        """INSERT OR REPLACE INTO signals
           (id, company_id, signal_type, signal_date, title, description,
            source_url, source_type) VALUES (?,?,?,?,?,?,?,?)""",
        rows,
    )
    return len(rows)


def _load_funding(conn) -> int:
    known = {r["id"] for r in conn.execute("SELECT id FROM companies")}
    rows = [
        (
            f["id"], f["company_id"], f.get("round_type"), f.get("amount_raised"),
            f.get("currency", "USD"), f.get("announced_date"), f.get("lead_investor"),
            json.dumps(f.get("other_investors") or [], ensure_ascii=False),
            f.get("source_url"), f.get("source_type"), f.get("cik"), f.get("accession_no"),
            1 if f.get("round_type_inferred") else 0,
        )
        for f in store.read_jsonl(paths.FUNDING)
        if f.get("company_id") in known
    ]
    conn.executemany(
        """INSERT OR REPLACE INTO funding_rounds
           (id, company_id, round_type, amount_raised, currency, announced_date,
            lead_investor, other_investors, source_url, source_type, cik,
            accession_no, round_type_inferred)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    return len(rows)


def run() -> dict[str, int]:
    paths.ensure_dirs()
    conn = db.reset(paths.DB)

    stats = {
        "companies": _load_companies(conn),
        "metric_snapshots": _load_snapshots(conn),
        "signals": _load_signals(conn),
        "funding_rounds": _load_funding(conn),
    }
    conn.commit()

    stats["momentum_scored"] = momentum.compute(conn, date.today())
    conn.close()
    return stats
