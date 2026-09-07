"""Export SQLite -> static JSON bundles for the web app.

GitHub Pages serves static files only, so the "API" is a set of pre-rendered
JSON documents. The split matters for load time:

  meta.json           facet values, counts, scoring weights  (small, always loaded)
  index.json          one compact row per company         (drives list + filters)
  recent-signals.json newest signals across all companies (the overview feed)
  details/<id>.json   history, signals, funding           (fetched on demand)

Only companies that actually have detail data get a detail file, so a fresh
install ships a handful rather than 6,000 near-empty documents.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import date

from . import db, paths, store
from .momentum import WEIGHTS

log = logging.getLogger(__name__)

# Cap history sent to the client. A year of daily points is plenty to chart.
_MAX_HISTORY_POINTS = 400

# YC profile URLs follow a fixed pattern, so shipping one per company wastes
# ~370KB in the index. The client reconstructs them from the id instead.
_YC_PROFILE_PREFIX = "https://www.ycombinator.com/companies/"


def _compact(row: dict) -> dict:
    """Drop empties before serialising.

    The index is the one file every visitor downloads, and roughly half these
    companies have no momentum data and no optional fields. Omitting nulls,
    empty lists and false flags cuts the payload by more than half; the client
    types treat every one of these as optional with a sane default.
    """
    out = {}
    for key, value in row.items():
        if value is None or value == [] or value is False or value == {}:
            continue
        out[key] = value
    return out


def _jloads(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default


def _index_rows(conn) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            c.id, c.name, c.one_liner, c.website, c.sector, c.sub_sector, c.tags,
            c.hq_location, c.founded_date, c.status, c.stage, c.batch, c.logo_url,
            c.profile_url, c.origin, c.top_company, c.notes,
            m.score, m.score_available, m.coverage, m.confidence,
            m.headcount_growth_90d, m.headcount_delta_90d,
            m.press_score, m.funding_recency, m.hiring_score, m.github_score,
            s.headcount, s.is_hiring,
            (SELECT COUNT(*) FROM signals g WHERE g.company_id = c.id) AS signal_count,
            (SELECT COUNT(*) FROM metric_snapshots k WHERE k.company_id = c.id) AS history_points,
            (SELECT COUNT(*) FROM funding_rounds f WHERE f.company_id = c.id) AS funding_count
        FROM companies c
        LEFT JOIN momentum m ON m.company_id = c.id
        LEFT JOIN (
            SELECT company_id, headcount, is_hiring FROM metric_snapshots
            WHERE (company_id, snapshot_date) IN (
                SELECT company_id, MAX(snapshot_date) FROM metric_snapshots GROUP BY company_id
            )
        ) s ON s.company_id = c.id
        ORDER BY c.name COLLATE NOCASE
        """
    ).fetchall()

    out = []
    for r in rows:
        components = {
            "headcountGrowth": r["headcount_growth_90d"],
            "headcountDelta": r["headcount_delta_90d"],
            "press": r["press_score"],
            "fundingRecency": r["funding_recency"],
            "hiring": r["hiring_score"],
            "github": r["github_score"],
        }
        components = {k: v for k, v in components.items() if v}

        momentum = None
        if r["score"]:
            momentum = _compact(
                {
                    "score": round(r["score"], 1),
                    "available": round(r["score_available"] or 0, 1),
                    "coverage": r["coverage"],
                    "confidence": r["confidence"],
                    "components": components,
                }
            )

        # Only custom companies need an explicit profile URL; YC ones are derived.
        profile_url = r["profile_url"] if r["origin"] != "yc" else None

        out.append(
            _compact({
                "id": r["id"],
                "name": r["name"],
                "tagline": r["one_liner"],
                "website": r["website"],
                "sector": r["sector"],
                "subSector": r["sub_sector"],
                "tags": _jloads(r["tags"], []),
                "location": r["hq_location"],
                "founded": r["founded_date"],
                "status": r["status"],
                "stage": r["stage"],
                "batch": r["batch"],
                "logo": r["logo_url"],
                "profileUrl": profile_url,
                "origin": r["origin"],
                "topCompany": bool(r["top_company"]),
                "notes": r["notes"],
                "headcount": r["headcount"],
                "isHiring": bool(r["is_hiring"]) if r["is_hiring"] is not None else None,
                "signalCount": r["signal_count"] or None,
                "historyPoints": r["history_points"] or None,
                "fundingCount": r["funding_count"] or None,
                "momentum": momentum,
            })
        )
    return out


def _meta(conn, index: list[dict]) -> dict:
    span = conn.execute(
        "SELECT MIN(snapshot_date) lo, MAX(snapshot_date) hi, COUNT(DISTINCT snapshot_date) days "
        "FROM metric_snapshots"
    ).fetchone()

    tag_counts = Counter(t for c in index for t in c.get("tags", []))

    def facet(key):
        return sorted({c[key] for c in index if c.get(key)})

    history_days = 0
    if span and span["lo"] and span["hi"]:
        history_days = (date.fromisoformat(span["hi"]) - date.fromisoformat(span["lo"])).days

    return {
        "generatedAt": conn.execute("SELECT MAX(computed_at) c FROM momentum").fetchone()["c"],
        "counts": {
            "companies": len(index),
            "yc": sum(1 for c in index if c.get("origin") == "yc"),
            "custom": sum(1 for c in index if c.get("origin") == "custom"),
            "signals": conn.execute("SELECT COUNT(*) n FROM signals").fetchone()["n"],
            "fundingRounds": conn.execute("SELECT COUNT(*) n FROM funding_rounds").fetchone()["n"],
            "snapshots": conn.execute("SELECT COUNT(*) n FROM metric_snapshots").fetchone()["n"],
            "hiring": sum(1 for c in index if c.get("isHiring")),
        },
        "history": {
            "firstSnapshot": span["lo"] if span else None,
            "latestSnapshot": span["hi"] if span else None,
            "distinctDays": span["days"] if span else 0,
            "spanDays": history_days,
        },
        "facets": {
            "sectors": facet("sector"),
            "subSectors": facet("subSector"),
            "statuses": facet("status"),
            "stages": facet("stage"),
            "batches": sorted({c["batch"] for c in index if c.get("batch")}),
            "topTags": [t for t, _ in tag_counts.most_common(60)],
        },
        "momentumWeights": WEIGHTS,
        "ycProfilePrefix": _YC_PROFILE_PREFIX,
    }


def _recent_signals(conn, limit: int = 60) -> list[dict]:
    """Newest signals across the whole universe, joined to their company.

    The overview needs a cross-company feed, which no per-company detail file
    can answer without fetching thousands of them.
    """
    rows = conn.execute(
        """
        SELECT s.id, s.company_id, s.signal_type, s.signal_date, s.title,
               s.source_url, s.source_type, c.name, c.logo_url, c.sector
        FROM signals s JOIN companies c ON c.id = s.company_id
        ORDER BY s.signal_date DESC, s.id
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "companyId": r["company_id"],
            "company": r["name"],
            "logo": r["logo_url"],
            "sector": r["sector"],
            "type": r["signal_type"],
            "date": r["signal_date"],
            "title": r["title"],
            "url": r["source_url"],
            "source": r["source_type"],
        }
        for r in rows
    ]


def _sector_breakdown(index: list[dict]) -> list[dict]:
    """Company counts per sector, for the overview's distribution chart."""
    counts = Counter(c.get("sector") or "Unspecified" for c in index)
    hiring = Counter(
        c.get("sector") or "Unspecified" for c in index if c.get("isHiring")
    )
    return [
        {"sector": sector, "companies": n, "hiring": hiring.get(sector, 0)}
        for sector, n in counts.most_common()
    ]


FUNDING_STAGES = ["Seed", "Series A", "Series B", "Series C", "Series D+"]


def _funding_matrix(conn) -> list[dict]:
    """One row per company that has filings, with totals per inferred stage.

    A company that never reached a stage simply has no entry for it, which the
    UI renders as an empty cell — the absence is the information.
    """
    rows = conn.execute(
        """
        SELECT f.company_id, c.name, c.sector, c.logo_url, c.batch, c.origin,
               f.round_type, f.amount_raised, f.announced_date, f.source_url,
               f.amount_basis
        FROM funding_rounds f JOIN companies c ON c.id = f.company_id
        ORDER BY c.name COLLATE NOCASE, f.announced_date
        """
    ).fetchall()

    companies: dict[str, dict] = {}
    for r in rows:
        entry = companies.setdefault(
            r["company_id"],
            {
                "id": r["company_id"],
                "company": r["name"],
                "sector": r["sector"],
                "logo": r["logo_url"],
                "batch": r["batch"],
                "origin": r["origin"],
                "stages": {},
                "total": 0.0,
                "filings": 0,
                "firstDate": None,
                "lastDate": None,
            },
        )
        stage = r["round_type"] or "Series D+"
        amount = r["amount_raised"] or 0.0

        cell = entry["stages"].setdefault(
            stage, {"amount": 0.0, "filings": 0, "url": r["source_url"], "date": None}
        )
        cell["amount"] += amount
        cell["filings"] += 1
        if r["announced_date"] and (not cell["date"] or r["announced_date"] < cell["date"]):
            cell["date"] = r["announced_date"]

        entry["total"] += amount
        entry["filings"] += 1
        date = r["announced_date"]
        if date:
            if not entry["firstDate"] or date < entry["firstDate"]:
                entry["firstDate"] = date
            if not entry["lastDate"] or date > entry["lastDate"]:
                entry["lastDate"] = date

    return sorted(companies.values(), key=lambda e: -e["total"])


def _details(conn, index: list[dict]) -> int:
    """Write a detail file per company that has something worth fetching."""
    detail_dir = paths.WEB_DATA / "details"
    detail_dir.mkdir(parents=True, exist_ok=True)
    for stale in detail_dir.glob("*.json"):
        stale.unlink()

    written = 0
    for company in index:
        cid = company["id"]
        # A company earns a detail file if it has anything worth fetching.
        # Funding was originally omitted from this test, which silently hid
        # every Form D filing we had collected.
        has_detail = (
            company.get("signalCount")
            or company.get("fundingCount")
            or (company.get("historyPoints") or 0) >= 2
        )
        if not has_detail:
            continue

        history = conn.execute(
            """SELECT snapshot_date, headcount, is_hiring, github_stars, github_contributors
               FROM metric_snapshots WHERE company_id = ?
               ORDER BY snapshot_date DESC LIMIT ?""",
            (cid, _MAX_HISTORY_POINTS),
        ).fetchall()

        signals = conn.execute(
            """SELECT id, signal_type, signal_date, title, description, source_url, source_type
               FROM signals WHERE company_id = ? ORDER BY signal_date DESC LIMIT 200""",
            (cid,),
        ).fetchall()

        funding = conn.execute(
            """SELECT id, round_type, amount_raised, currency, announced_date, lead_investor,
                      other_investors, source_url, source_type, round_type_inferred
               FROM funding_rounds WHERE company_id = ? ORDER BY announced_date DESC""",
            (cid,),
        ).fetchall()

        payload = {
            "id": cid,
            "history": [
                {
                    "date": h["snapshot_date"],
                    "headcount": h["headcount"],
                    "isHiring": bool(h["is_hiring"]) if h["is_hiring"] is not None else None,
                    "githubStars": h["github_stars"],
                    "githubContributors": h["github_contributors"],
                }
                for h in reversed(history)
            ],
            "signals": [
                {
                    "id": s["id"],
                    "type": s["signal_type"],
                    "date": s["signal_date"],
                    "title": s["title"],
                    "description": s["description"],
                    "url": s["source_url"],
                    "source": s["source_type"],
                }
                for s in signals
            ],
            "funding": [
                {
                    "id": f["id"],
                    "round": f["round_type"],
                    "amount": f["amount_raised"],
                    "currency": f["currency"],
                    "date": f["announced_date"],
                    "lead": f["lead_investor"],
                    "investors": _jloads(f["other_investors"], []),
                    "url": f["source_url"],
                    "source": f["source_type"],
                    "roundInferred": bool(f["round_type_inferred"]),
                }
                for f in funding
            ],
        }

        safe = cid.replace(":", "__").replace("/", "_")
        store.write_json(detail_dir / f"{safe}.json", payload, compact=True)
        written += 1

    return written


def run() -> dict[str, object]:
    paths.ensure_dirs()
    conn = db.connect(paths.DB)

    index = _index_rows(conn)
    store.write_json(paths.WEB_DATA / "index.json", index, compact=True)

    meta = _meta(conn, index)
    meta["sectorBreakdown"] = _sector_breakdown(index)
    store.write_json(paths.WEB_DATA / "meta.json", meta)

    recent = _recent_signals(conn)
    store.write_json(paths.WEB_DATA / "recent-signals.json", recent, compact=True)

    matrix = _funding_matrix(conn)
    store.write_json(
        paths.WEB_DATA / "funding-matrix.json",
        {"stages": FUNDING_STAGES, "rows": matrix},
        compact=True,
    )

    detail_count = _details(conn, index)

    conn.close()

    index_kb = (paths.WEB_DATA / "index.json").stat().st_size // 1024
    return {
        "index_rows": len(index),
        "index_size_kb": index_kb,
        "recent_signals": len(recent),
        "funding_matrix_rows": len(matrix),
        "detail_files": detail_count,
    }
