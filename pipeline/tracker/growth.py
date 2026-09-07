"""Headcount growth over time windows, and the compact series charts need.

This is the module the product's central question depends on: not "how big is
this company" but "which direction is it moving, and how fast".

Two rules run through it:

*Never invent a comparison.* A window is only reported when there is an
observation old enough to anchor it. A company first seen three months ago has
no 12-month growth, and reporting one — by falling back to its earliest point
and calling it a year — would silently overstate every young company. Missing
windows come back as ``None`` and render as "—".

*Read the series as a step function.* Headcount holds its value until it
changes, so the value "90 days ago" is the last observation at or before that
date — not the nearest one in either direction. This matters twice over: it is
correct when observations are sparse (only changes are stored), and it stays
correct across the 11-week gap in the upstream source during early 2026, where
a nearest-match would silently reach *forward* past the gap and compare against
a later reading. The real span behind each window is reported alongside it, so
a figure resting on an old reading can be flagged rather than trusted blindly.

A note on what the numbers mean. ``pct`` is genuinely the change over the
labelled window: the value in force on the target date, compared to now. When
the anchoring observation is much older than the window — because the company's
headcount simply hadn't changed since — the figure is still correct, but it
rests on a stale reading, so ``anchorDate`` and ``stale`` are reported so the
UI can say so instead of implying fresh measurement.
"""

from __future__ import annotations

import sqlite3
from datetime import date, timedelta

# Windows the UI offers, in days.
WINDOWS = {"d30": 30, "d90": 90, "d180": 180, "d365": 365}

# How much further back than the target an anchoring observation may sit.
# Because only changes are stored, a flat company can legitimately have no
# reading for months — carrying its last value forward is correct. The cap
# stops a window from being anchored to something arbitrarily ancient.
_MAX_CARRY = {"d30": 60, "d90": 120, "d180": 210, "d365": 400}

# Points kept for the inline sparkline. Enough to read a shape, small enough
# that 4,500 of them don't bloat the index.
SPARK_POINTS = 12


def _series(conn: sqlite3.Connection, company_id: str) -> list[tuple[date, int]]:
    rows = conn.execute(
        """
        SELECT snapshot_date, headcount FROM metric_snapshots
        WHERE company_id = ? AND headcount IS NOT NULL
        ORDER BY snapshot_date
        """,
        (company_id,),
    ).fetchall()
    out = []
    for r in rows:
        try:
            out.append((date.fromisoformat(r["snapshot_date"]), int(r["headcount"])))
        except (ValueError, TypeError):
            continue
    return out


def _value_at(series: list[tuple[date, int]], target: date, max_carry: int):
    """The value in force on ``target``: the last observation at or before it.

    Never looks forward. Reaching past the target would compare against a
    reading that didn't exist yet, which inflates or deflates growth depending
    on which side of the gap the data happens to fall.
    """
    best = None
    for when, value in series:
        if when > target:
            break
        best = (when, value)
    if best is None:
        return None
    if (target - best[0]).days > max_carry:
        return None
    return best


def compute(conn: sqlite3.Connection, company_id: str, today: date | None = None) -> dict:
    """Growth across every window, plus a downsampled series for the sparkline.

    ``today`` is an *as-of* date: observations after it are ignored, so the
    result is what would have been reported on that day. This is what makes
    "score moved +12 this month" possible — without truncation, asking for a
    past date silently returned today's figures and every delta came out zero.
    """
    today = today or date.today()
    series = [point for point in _series(conn, company_id) if point[0] <= today]

    if not series:
        return {"current": None, "windows": {}, "spark": [], "observations": 0}

    latest_date, current = series[-1]
    first_date = series[0][0]

    windows: dict[str, dict] = {}
    for name, days in WINDOWS.items():
        target = latest_date - timedelta(days=days)
        # A company first observed after the target simply has no such window;
        # falling back to its earliest point would overstate every young one.
        if first_date > target:
            continue
        anchor = _value_at(series, target, _MAX_CARRY[name])
        if anchor is None:
            continue
        anchor_date, anchor_value = anchor
        if not anchor_value:
            continue
        delta = current - anchor_value
        anchor_age = (latest_date - anchor_date).days
        windows[name] = {
            "from": anchor_value,
            "to": current,
            "delta": delta,
            "pct": round(delta / anchor_value * 100, 1),
            # When the anchoring reading was actually taken. The growth figure
            # covers the labelled window regardless; this says how much of it
            # rests on carrying an older value forward.
            "anchorDate": anchor_date.isoformat(),
            "anchorAgeDays": anchor_age,
            # Flagged when the supporting reading is more than half again as
            # old as the window it anchors.
            "stale": anchor_age > days * 1.5,
        }

    return {
        "current": current,
        "latest": latest_date.isoformat(),
        "first": first_date.isoformat(),
        "windows": windows,
        "spark": _downsample([v for _, v in series], SPARK_POINTS),
        "observations": len(series),
    }


def _downsample(values: list[int], target: int) -> list[int]:
    """Evenly sample a series down to ``target`` points, always keeping the ends."""
    if len(values) <= target:
        return values
    step = (len(values) - 1) / (target - 1)
    return [values[round(i * step)] for i in range(target)]


# ---------------------------------------------------------------------------
# Trajectory
# ---------------------------------------------------------------------------

# A company must be at least this size before a percentage move is treated as
# a trend. Below it, one or two hires swing the rate enough to label a company
# "accelerating" on noise.
_TRAJECTORY_MIN_BASE = 10

TRAJECTORIES = ("accelerating", "growing", "stable", "cooling", "contracting")


def _pct_between(series: list[tuple[date, int]], start: date, end: date) -> float | None:
    """Percentage change between the values in force on two dates."""
    a = _value_at(series, start, _MAX_CARRY["d180"])
    b = _value_at(series, end, _MAX_CARRY["d90"])
    if a is None or b is None or not a[1]:
        return None
    return (b[1] - a[1]) / a[1] * 100


def trajectory(conn: sqlite3.Connection, company_id: str, today: date | None = None) -> dict:
    """Classify direction of travel by comparing two consecutive 90-day windows.

    A single growth figure says how far a company moved; it doesn't say whether
    it is speeding up or slowing down. Comparing the most recent quarter to the
    one before it does, and that second-order reading is what makes a directory
    feel like a live market rather than a snapshot.

    Returns ``label: None`` when there isn't enough history or the company is
    too small for a rate to mean anything — the UI then shows nothing at all,
    which is better than showing "stable" for a company we cannot read.
    """
    today = today or date.today()
    series = [point for point in _series(conn, company_id) if point[0] <= today]
    if len(series) < 2:
        return {"label": None, "recent": None, "prior": None}

    latest_date, current = series[-1]
    if current < _TRAJECTORY_MIN_BASE:
        return {"label": None, "recent": None, "prior": None, "reason": "too small to read"}

    recent = _pct_between(series, latest_date - timedelta(days=90), latest_date)
    prior = _pct_between(
        series, latest_date - timedelta(days=180), latest_date - timedelta(days=90)
    )

    if recent is None:
        return {"label": None, "recent": None, "prior": None}

    if recent <= -15:
        label = "contracting"
    elif recent < -3:
        label = "cooling"
    elif prior is not None and recent >= 15 and recent > prior + 10:
        # Speeding up: this quarter's rate clearly beats last quarter's.
        label = "accelerating"
    elif prior is not None and prior >= 15 and recent < prior - 10 and recent < 8:
        # Was growing fast, now noticeably slower.
        label = "cooling"
    elif recent >= 5:
        label = "growing"
    else:
        label = "stable"

    return {
        "label": label,
        "recent": round(recent, 1),
        "prior": round(prior, 1) if prior is not None else None,
    }
