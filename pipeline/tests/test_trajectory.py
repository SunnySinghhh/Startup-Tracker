"""Trajectory classification — direction of travel, not position."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from tracker import db, growth

TODAY = date(2026, 9, 7)


@pytest.fixture
def conn(tmp_path):
    c = db.reset(tmp_path / "t.db")
    c.execute("INSERT INTO companies (id, name, origin) VALUES ('c1','Test','yc')")
    c.commit()
    return c


def add(conn, days_ago: int, headcount: int):
    conn.execute(
        "INSERT OR REPLACE INTO metric_snapshots (company_id, snapshot_date, headcount) "
        "VALUES ('c1', ?, ?)",
        ((TODAY - timedelta(days=days_ago)).isoformat(), headcount),
    )
    conn.commit()


def label(conn) -> str | None:
    return growth.trajectory(conn, "c1", TODAY)["label"]


def test_speeding_up_is_accelerating(conn):
    add(conn, 180, 50)
    add(conn, 90, 55)   # +10% in the earlier quarter
    add(conn, 0, 80)    # +45% in the recent one
    assert label(conn) == "accelerating"


def test_steady_growth_is_growing_not_accelerating(conn):
    add(conn, 180, 50)
    add(conn, 90, 60)
    add(conn, 0, 70)
    assert label(conn) == "growing"


def test_slowing_down_is_cooling(conn):
    add(conn, 180, 50)
    add(conn, 90, 90)   # +80% earlier
    add(conn, 0, 92)    # barely moved since
    assert label(conn) == "cooling"


def test_shrinking_is_contracting(conn):
    add(conn, 180, 100)
    add(conn, 90, 100)
    add(conn, 0, 70)
    assert label(conn) == "contracting"


def test_flat_is_stable(conn):
    add(conn, 180, 60)
    add(conn, 90, 60)
    add(conn, 0, 61)
    assert label(conn) == "stable"


def test_tiny_teams_get_no_label(conn):
    """One hire swings a 4-person team by 25%; that is not a trend."""
    add(conn, 180, 2)
    add(conn, 90, 3)
    add(conn, 0, 5)
    assert label(conn) is None


def test_no_label_without_enough_history(conn):
    add(conn, 10, 40)
    add(conn, 0, 60)
    assert label(conn) is None, "a 10-day-old company has no 90-day rate"


def test_as_of_date_excludes_later_observations(conn):
    """Trajectory must be readable at a past date for score history to work."""
    add(conn, 180, 50)
    add(conn, 90, 55)
    add(conn, 0, 200)
    past = growth.trajectory(conn, "c1", TODAY - timedelta(days=90))
    assert past["recent"] != growth.trajectory(conn, "c1", TODAY)["recent"]
