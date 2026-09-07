"""Momentum scoring, especially its behaviour when data is missing."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from tracker import db, momentum

TODAY = date(2026, 9, 6)


@pytest.fixture
def conn(tmp_path):
    connection = db.reset(tmp_path / "t.db")
    connection.execute(
        "INSERT INTO companies (id, name, origin) VALUES ('c1', 'Test Co', 'yc')"
    )
    connection.commit()
    return connection


def _snapshot(conn, day: date, **fields):
    columns = ["company_id", "snapshot_date", *fields]
    values = ["c1", day.isoformat(), *fields.values()]
    conn.execute(
        f"INSERT OR REPLACE INTO metric_snapshots ({','.join(columns)}) "
        f"VALUES ({','.join('?' * len(columns))})",
        values,
    )
    conn.commit()


def _score(conn) -> dict:
    momentum.compute(conn, TODAY)
    return dict(conn.execute("SELECT * FROM momentum WHERE company_id='c1'").fetchone())


def test_no_data_scores_zero_with_no_confidence(conn):
    row = _score(conn)
    assert row["score"] == 0.0
    assert row["confidence"] == "none"
    assert row["coverage"] == 0.0


def test_a_single_binary_signal_cannot_reach_the_top_of_the_scale(conn):
    """The cold-start failure mode this model exists to prevent.

    Renormalising weights over available components gave every hiring company a
    score of exactly 100 on day one — 1,477 companies tied, ranking useless.
    Scoring on observed evidence caps a hiring-only company at its own weight.
    """
    _snapshot(conn, TODAY, is_hiring=1)
    row = _score(conn)

    assert row["score"] == pytest.approx(momentum.WEIGHTS["hiring"] * 100)
    assert row["score"] < 20
    # Strength on what was measured is still reported as full.
    assert row["score_available"] == pytest.approx(100.0)
    assert row["coverage"] == pytest.approx(momentum.WEIGHTS["hiring"])


def test_more_evidence_outranks_a_single_signal(conn):
    # Must span at least the 90-day window: an 80-day history has no 90-day
    # growth, and the model now declines to call a shorter span one.
    _snapshot(conn, TODAY - timedelta(days=100), headcount=100)
    _snapshot(conn, TODAY, headcount=150, is_hiring=1)
    row = _score(conn)

    hiring_only = momentum.WEIGHTS["hiring"] * 100
    assert row["score"] > hiring_only
    assert row["headcount_delta_90d"] == 50
    assert row["headcount_growth_90d"] == pytest.approx(50.0)


def test_headcount_growth_needs_two_observations(conn):
    _snapshot(conn, TODAY, headcount=100)
    row = _score(conn)
    assert row["headcount_growth_90d"] is None, "one point is not a trend"


def test_history_shorter_than_the_window_earns_no_growth_credit(conn):
    """80 days of history is not 90-day growth."""
    _snapshot(conn, TODAY - timedelta(days=80), headcount=100)
    _snapshot(conn, TODAY, headcount=150)
    assert _score(conn)["headcount_growth_90d"] is None


def test_small_teams_do_not_outrank_large_ones_on_percentage(conn):
    """2 -> 5 employees is +150% but is not a hiring story.

    Before damping, moves like this dominated the entire ranking.
    """
    _snapshot(conn, TODAY - timedelta(days=100), headcount=2)
    _snapshot(conn, TODAY, headcount=5)
    tiny = _score(conn)["score"]

    conn.execute("DELETE FROM metric_snapshots")
    conn.execute("DELETE FROM momentum")
    _snapshot(conn, TODAY - timedelta(days=100), headcount=60)
    _snapshot(conn, TODAY, headcount=90)
    big = _score(conn)["score"]

    assert big > tiny, "a 60 -> 90 move must outrank 2 -> 5"


def test_unmeasured_components_are_null_not_zero(conn):
    """A missing GitHub org must be distinguishable from an inactive one."""
    _snapshot(conn, TODAY, is_hiring=1)
    row = _score(conn)
    assert row["github_score"] is None
    assert row["press_score"] is None


def test_confidence_rises_with_history_and_breadth(conn):
    _snapshot(conn, TODAY - timedelta(days=120), headcount=100)
    _snapshot(conn, TODAY, headcount=140, is_hiring=1)
    conn.execute(
        "INSERT INTO signals (id, company_id, signal_type, signal_date, source_type) "
        "VALUES ('s1','c1','funding',?,'rss')",
        (TODAY.isoformat(),),
    )
    conn.commit()
    assert _score(conn)["confidence"] == "high"


def test_growth_is_capped_so_one_outlier_cannot_dominate(conn):
    _snapshot(conn, TODAY - timedelta(days=80), headcount=1)
    _snapshot(conn, TODAY, headcount=500)
    row = _score(conn)
    ceiling = momentum.WEIGHTS["headcount_growth"] * 100
    assert row["score"] <= ceiling + 0.01
