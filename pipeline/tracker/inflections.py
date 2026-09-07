"""Inflections: moments where a company's trajectory changed.

The difference between a directory and an intelligence product is that a
directory tells you the current state and an intelligence product tells you
what just changed. This module detects those moments and, crucially, carries
the evidence for each one so a reader can check the claim rather than trust it.

Only inflections this pipeline can actually evidence are emitted. Several
obvious ones — a burst of job postings, a CFO hire, a founder going quiet —
need people or jobs data that no free, terms-compliant source provides, so
they are absent rather than approximated. What remains is grounded in the
headcount series and SEC filings.
"""

from __future__ import annotations

import hashlib
import sqlite3
from datetime import date, timedelta
from typing import Any

from . import growth

# How far back an inflection stays interesting.
DEFAULT_WINDOW_DAYS = 120

# A company must clear this *at the start of the window* before a percentage
# move is reported. Checking only the current size lets 4 -> 13 through as
# "+225% accelerating", which is a rounding error in a team, not an inflection.
MIN_BASE = 12

MILESTONES = (25, 50, 100, 250, 500, 1000)

# A raise following a gap this long is a change of state, not a routine top-up.
LONG_GAP_DAYS = 540


def _iid(*parts: str) -> str:
    return "inf:" + hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


def _headcount_events(
    conn: sqlite3.Connection, company_id: str, today: date, cutoff: date
) -> list[dict[str, Any]]:
    series = growth._series(conn, company_id)
    if len(series) < 2:
        return []

    latest_date, current = series[-1]
    if current < MIN_BASE:
        return []

    out: list[dict[str, Any]] = []
    traj = growth.trajectory(conn, company_id, today)

    if traj["label"] in ("accelerating", "contracting") and latest_date >= cutoff:
        window = growth.compute(conn, company_id, today)["windows"].get("d90")
        if window and window["from"] >= MIN_BASE and abs(window["delta"]) >= 5:
            up = traj["label"] == "accelerating"
            evidence = [
                f"Headcount {window['from']} → {window['to']} over 90 days "
                f"({window['pct']:+.0f}%)",
            ]
            if traj["prior"] is not None:
                evidence.append(
                    f"Previous 90 days: {traj['prior']:+.0f}% — "
                    f"{'rate increased' if up else 'rate fell'}"
                )
            out.append(
                {
                    "id": _iid(company_id, "traj", traj["label"], latest_date.isoformat()),
                    "type": "headcount",
                    "direction": "up" if up else "down",
                    "date": latest_date.isoformat(),
                    "headline": (
                        f"Hiring accelerating · {window['pct']:+.0f}% in 90 days"
                        if up
                        else f"Headcount contracting · {window['pct']:+.0f}% in 90 days"
                    ),
                    "evidence": evidence,
                    "rank": abs(window["pct"]) + abs(window["delta"]),
                }
            )

    # Milestone crossings, but only ones we actually observed the company cross.
    previous = None
    for when, value in series:
        if previous is not None and when >= cutoff:
            for threshold in MILESTONES:
                if previous < threshold <= value:
                    out.append(
                        {
                            "id": _iid(company_id, "milestone", str(threshold)),
                            "type": "milestone",
                            "direction": "up",
                            "date": when.isoformat(),
                            "headline": f"Passed {threshold} employees",
                            "evidence": [
                                f"Observed at {value}, up from {previous}",
                                "Crossing date is approximate — readings are weekly",
                            ],
                            "rank": threshold / 10,
                        }
                    )
        previous = value

    return out


def _funding_events(
    conn: sqlite3.Connection, company_id: str, cutoff: date
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT announced_date, round_type, amount_raised
        FROM funding_rounds WHERE company_id = ? AND announced_date IS NOT NULL
        ORDER BY announced_date
        """,
        (company_id,),
    ).fetchall()
    if not rows:
        return []

    out: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        try:
            when = date.fromisoformat(str(row["announced_date"])[:10])
        except ValueError:
            continue
        if when < cutoff:
            continue

        amount = row["amount_raised"]
        amount_text = f"${amount / 1_000_000:,.1f}M" if amount else "amount not in filing"
        evidence = [f"SEC Form D filed {when.isoformat()}", f"Offering: {amount_text}"]
        headline = f"Raised {amount_text}"
        rank = 50.0

        if index == 0:
            headline = f"First SEC filing · {amount_text}"
            evidence.append("No earlier Form D on record")
        else:
            try:
                previous = date.fromisoformat(str(rows[index - 1]["announced_date"])[:10])
                gap = (when - previous).days
                if gap >= LONG_GAP_DAYS:
                    headline = f"Raised after {gap // 30} months · {amount_text}"
                    evidence.append(f"Previous filing was {gap} days earlier")
                    rank = 70.0
            except ValueError:
                pass

        out.append(
            {
                "id": _iid(company_id, "funding", when.isoformat()),
                "type": "funding",
                "direction": "up",
                "date": when.isoformat(),
                "headline": headline,
                "evidence": evidence,
                "rank": rank,
            }
        )
    return out


def _hiring_flag_events(
    conn: sqlite3.Connection, company_id: str, cutoff: date
) -> list[dict[str, Any]]:
    """Transitions of the hiring flag.

    Only transitions are stored, so a row here means the flag genuinely
    flipped rather than merely being re-observed.
    """
    rows = conn.execute(
        """
        SELECT snapshot_date, is_hiring FROM metric_snapshots
        WHERE company_id = ? AND is_hiring IS NOT NULL ORDER BY snapshot_date
        """,
        (company_id,),
    ).fetchall()

    out: list[dict[str, Any]] = []
    previous: int | None = None
    for row in rows:
        value = row["is_hiring"]
        if previous is not None and value != previous:
            try:
                when = date.fromisoformat(row["snapshot_date"])
            except ValueError:
                previous = value
                continue
            if when >= cutoff and value == 1:
                out.append(
                    {
                        "id": _iid(company_id, "hiring-on", when.isoformat()),
                        "type": "hiring",
                        "direction": "up",
                        "date": when.isoformat(),
                        "headline": "Started hiring",
                        "evidence": ["Y Combinator hiring flag switched on"],
                        "rank": 20.0,
                    }
                )
        previous = value
    return out


def detect(
    conn: sqlite3.Connection,
    companies: list[dict[str, Any]],
    today: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Build the inflection feed across the tracked universe."""
    today = today or date.today()
    cutoff = today - timedelta(days=window_days)

    feed: list[dict[str, Any]] = []
    for company in companies:
        cid = company["id"]
        events = (
            _headcount_events(conn, cid, today, cutoff)
            + _funding_events(conn, cid, cutoff)
            + _hiring_flag_events(conn, cid, cutoff)
        )
        for event in events:
            event["companyId"] = cid
            event["company"] = company["name"]
            event["logo"] = company.get("logo_url")
            event["sector"] = company.get("sector")
            feed.append(event)

    # Most recent first, then by how much the event moved.
    feed.sort(key=lambda e: (e["date"], e["rank"]), reverse=True)
    return feed[:limit]
