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
    """Growth across every window, plus a downsampled series for the sparkline."""
    today = today or date.today()
    series = _series(conn, company_id)

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
