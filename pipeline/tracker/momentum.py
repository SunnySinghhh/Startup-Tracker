"""Momentum scoring.

A weighted blend of leading signals into a single 0-100 score, plus the
component breakdown so the number is never a black box — the UI shows *why* a
company scored what it did.

The central design decision here is how to handle missing data, and the naive
answers are both wrong.

Renormalising the weights over whatever components exist collapses on a fresh
install: with only the binary ``hiring`` flag available, every hiring company
scores exactly 100 and the ranking carries no information. Treating missing
data as a genuine zero, meanwhile, conflates "no momentum" with "not measured".

So two numbers are reported. ``score`` weights only the evidence actually
observed, which means a company cannot claim momentum we have not seen — this
is the ranking number. ``score_available`` renormalises over present
components and answers "how strong is this company on what we *did* measure".
``coverage`` states what fraction of the weighting the evidence covers, and
``confidence`` grades how much history backs it. The UI shows all four, so the
score is never a black box.
"""

from __future__ import annotations

import math
import sqlite3
from datetime import UTC, date, datetime, timedelta

from . import growth

# Relative weights. Renormalised over whichever components have data.
WEIGHTS = {
    "headcount_growth": 0.35,
    "press": 0.25,
    "hiring": 0.15,
    "funding_recency": 0.15,
    "github": 0.10,
}


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


# Below this headcount, percentage growth is dominated by noise: a company
# going 2 -> 5 is +150%, which outranks 60 -> 90 on percentage alone while
# saying far less about momentum. Growth is scaled toward full credit as the
# base approaches this size.
_GROWTH_BASE_FOR_FULL_CREDIT = 20


def _headcount_growth(conn: sqlite3.Connection, company_id: str, today: date):
    """Percentage headcount change over the trailing 90 days.

    Returns (normalised_0_1, raw_pct, absolute_delta) or None when the company
    has no observation old enough to anchor the window.

    Reads the series as a step function via ``growth``, rather than taking the
    oldest row inside the window: with change-only storage a flat company has
    no row inside the window at all, and its growth is 0%, not unknown.
    """
    windows = growth.compute(conn, company_id, today).get("windows") or {}
    window = windows.get("d90")
    if not window:
        return None

    base = window["from"]
    if not base:
        return None

    pct = window["pct"] / 100.0
    delta = window["delta"]

    # A 50% gain over 90 days is exceptional; treat that as the top of the scale.
    score = _clamp(pct / 0.5)
    # Damp small-base growth so a 2 -> 5 move can't outrank a 60 -> 90 one.
    score *= min(1.0, base / _GROWTH_BASE_FOR_FULL_CREDIT)
    return score, pct, delta


def _press_score(conn: sqlite3.Connection, company_id: str, today: date) -> float | None:
    """Weighted press mentions in the trailing 30 days.

    High-confidence matches count fully; medium and low are discounted, so a
    pile of shaky matches can't manufacture momentum.
    """
    window_start = (today - timedelta(days=30)).isoformat()
    rows = conn.execute(
        """
        SELECT source_type, signal_type, COUNT(*) AS n FROM signals
        WHERE company_id = ? AND signal_date >= ? AND signal_type IN ('press', 'funding')
        GROUP BY source_type, signal_type
        """,
        (company_id, window_start),
    ).fetchall()

    if not rows:
        return None

    total = sum(r["n"] for r in rows)
    # Diminishing returns: 1 mention is meaningful, the 10th much less so.
    return _clamp(math.log1p(total) / math.log1p(8))


def _hiring_score(conn: sqlite3.Connection, company_id: str, today: date) -> float | None:
    """The hiring flag in force on ``today``.

    Bounded by the as-of date like every other component; reading the latest
    flag regardless of date would leak present state into a past score.
    """
    row = conn.execute(
        """
        SELECT is_hiring FROM metric_snapshots
        WHERE company_id = ? AND is_hiring IS NOT NULL AND snapshot_date <= ?
        ORDER BY snapshot_date DESC LIMIT 1
        """,
        (company_id, today.isoformat()),
    ).fetchone()
    if row is None:
        return None
    return 1.0 if row["is_hiring"] else 0.0


def _funding_recency(conn: sqlite3.Connection, company_id: str, today: date) -> float | None:
    """Recency of the last known raise, decaying over ~18 months.

    Deliberately *not* a measure of amount. This asks "is this company active
    in the market recently", which is the leading question, rather than "how
    big was the cheque", which is lagging.
    """
    row = conn.execute(
        """
        SELECT MAX(d) AS last_date FROM (
            SELECT announced_date AS d FROM funding_rounds WHERE company_id = ?
            UNION ALL
            SELECT signal_date  AS d FROM signals
            WHERE company_id = ? AND signal_type = 'funding'
        )
        """,
        (company_id, company_id),
    ).fetchone()

    if row is None or not row["last_date"]:
        return None

    try:
        last = date.fromisoformat(str(row["last_date"])[:10])
    except ValueError:
        return None

    days = (today - last).days
    if days < 0:
        return 1.0
    return _clamp(1.0 - days / 548.0)


def _github_score(conn: sqlite3.Connection, company_id: str, today: date) -> float | None:
    """Star growth over the trailing 90 days, log-scaled."""
    window_start = (today - timedelta(days=90)).isoformat()
    rows = conn.execute(
        """
        SELECT github_stars FROM metric_snapshots
        WHERE company_id = ? AND github_stars IS NOT NULL AND snapshot_date >= ?
        ORDER BY snapshot_date
        """,
        (company_id, window_start),
    ).fetchall()

    if len(rows) < 2:
        return None

    delta = rows[-1]["github_stars"] - rows[0]["github_stars"]
    if delta <= 0:
        return 0.0
    # 1000 new stars in 90 days tops the scale.
    return _clamp(math.log1p(delta) / math.log1p(1000))


def _confidence(components: dict[str, float | None], history_days: int) -> str:
    """How much should you trust this score?

    Reported honestly rather than hidden, because on a fresh install the answer
    is "not much" and the dashboard should say so.
    """
    present = sum(1 for v in components.values() if v is not None)
    if present == 0:
        return "none"
    if history_days >= 90 and present >= 3:
        return "high"
    if history_days >= 30 and present >= 2:
        return "medium"
    return "low"


def _score_for(conn: sqlite3.Connection, cid: str, today: date) -> tuple[float, dict]:
    """Score one company as of ``today``, returning (score, components)."""
    growth_result = _headcount_growth(conn, cid, today)
    components: dict[str, float | None] = {
        "headcount_growth": growth_result[0] if growth_result else None,
        "press": _press_score(conn, cid, today),
        "hiring": _hiring_score(conn, cid, today),
        "funding_recency": _funding_recency(conn, cid, today),
        "github": _github_score(conn, cid, today),
    }
    available = {k: v for k, v in components.items() if v is not None}
    weighted = sum(WEIGHTS[k] * v for k, v in available.items())
    return weighted * 100, components


def scores_as_of(conn: sqlite3.Connection, when: date) -> dict[str, float]:
    """Every company's score at a past date, for reporting how it has moved.

    A score with no direction is a static label; "87, up 12 this month" tells
    you something happened. Recomputing rather than storing history means the
    delta always reflects the current model, so changing the weights doesn't
    leave stale deltas behind.
    """
    out: dict[str, float] = {}
    for row in conn.execute("SELECT id FROM companies"):
        score, _ = _score_for(conn, row["id"], when)
        out[row["id"]] = round(score, 2)
    return out


def compute(conn: sqlite3.Connection, today: date | None = None) -> int:
    today = today or date.today()

    span = conn.execute(
        "SELECT MIN(snapshot_date) AS lo, MAX(snapshot_date) AS hi FROM metric_snapshots"
    ).fetchone()
    history_days = 0
    if span and span["lo"] and span["hi"]:
        history_days = (date.fromisoformat(span["hi"]) - date.fromisoformat(span["lo"])).days

    company_ids = [r["id"] for r in conn.execute("SELECT id FROM companies")]
    conn.execute("DELETE FROM momentum")

    # Aware UTC: this is generated on a CI runner and read by browsers in
    # any timezone, so a naive local timestamp is genuinely ambiguous.
    computed_at = datetime.now(UTC).isoformat(timespec="seconds")
    rows = []

    for cid in company_ids:
        growth_result = _headcount_growth(conn, cid, today)
        components: dict[str, float | None] = {
            "headcount_growth": growth_result[0] if growth_result else None,
            "press": _press_score(conn, cid, today),
            "hiring": _hiring_score(conn, cid, today),
            "funding_recency": _funding_recency(conn, cid, today),
            "github": _github_score(conn, cid, today),
        }

        available = {k: v for k, v in components.items() if v is not None}
        observed_weight = sum(WEIGHTS[k] for k in available)
        weighted = sum(WEIGHTS[k] * v for k, v in available.items())

        # Ranking score: only observed evidence counts toward the total.
        score = weighted * 100
        # Strength on measured components alone, for interpretation.
        score_available = (weighted / observed_weight * 100) if observed_weight else 0.0
        coverage = observed_weight  # weights sum to 1.0, so this is a fraction

        rows.append(
            (
                cid,
                round(score, 2),
                round(score_available, 2),
                round(coverage, 3),
                round(growth_result[1] * 100, 2) if growth_result else None,
                growth_result[2] if growth_result else None,
                components["press"],
                components["funding_recency"],
                components["hiring"],
                components["github"],
                _confidence(components, history_days),
                computed_at,
            )
        )

    conn.executemany(
        """
        INSERT INTO momentum (
            company_id, score, score_available, coverage,
            headcount_growth_90d, headcount_delta_90d,
            press_score, funding_recency, hiring_score, github_score,
            confidence, computed_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        rows,
    )
    conn.commit()

    # Re-run the model 30 days back so the score carries a direction. Computed
    # rather than stored historically, so a change to the weights re-scores the
    # past too instead of leaving stale deltas behind.
    prior = scores_as_of(conn, today - timedelta(days=30))
    current = {
        r["company_id"]: r["score"]
        for r in conn.execute("SELECT company_id, score FROM momentum")
    }
    conn.executemany(
        "UPDATE momentum SET score_30d_ago = ?, score_delta_30d = ? WHERE company_id = ?",
        [
            (value, round((current.get(cid) or 0) - value, 2), cid)
            for cid, value in prior.items()
        ],
    )
    conn.commit()
    return len(rows)
