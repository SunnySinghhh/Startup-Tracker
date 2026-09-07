"""Growth windows — the numbers the whole product leans on."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from tracker import db, growth

TODAY = date(2026, 9, 7)


@pytest.fixture
def conn(tmp_path):
    c = db.reset(tmp_path / "g.db")
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


def test_no_data_returns_empty(conn):
    result = growth.compute(conn, "c1", TODAY)
    assert result["current"] is None
    assert result["windows"] == {}


def test_computes_percentage_and_absolute_change(conn):
    add(conn, 90, 61)
    add(conn, 0, 74)
    w = growth.compute(conn, "c1", TODAY)["windows"]["d90"]
    assert w["from"] == 61
    assert w["to"] == 74
    assert w["delta"] == 13
    assert w["pct"] == pytest.approx(21.3, abs=0.1)


def test_window_is_omitted_when_history_is_too_short(conn):
    """A 3-month-old company must not report 12-month growth.

    Falling back to the earliest available point would silently overstate
    growth for every young company.
    """
    add(conn, 60, 35)
    add(conn, 30, 40)
    add(conn, 0, 80)
    windows = growth.compute(conn, "c1", TODAY)["windows"]
    assert "d30" in windows, "60 days of history supports a 30-day window"
    assert "d365" not in windows
    assert "d180" not in windows


def test_last_value_before_the_target_anchors_the_window(conn):
    """Only changes are stored, so the anchor is carried forward."""
    add(conn, 104, 50)
    add(conn, 0, 75)
    w = growth.compute(conn, "c1", TODAY)["windows"]["d90"]
    assert w["from"] == 50
    assert w["anchorAgeDays"] == 104, "the anchoring reading's true age is reported"
    assert w["stale"] is False, "104 days is within 1.5x the 90-day window (135)"


def test_never_anchors_to_a_reading_after_the_target(conn):
    """The upstream source has an 11-week gap; reaching forward across it
    would compare against a value that did not exist at the target date."""
    add(conn, 150, 10)  # the value in force 90 days ago
    add(conn, 20, 90)   # a later jump, *after* the 90-day target
    add(conn, 0, 95)
    w = growth.compute(conn, "c1", TODAY)["windows"]["d90"]
    assert w["from"] == 10, "must use the value in force 90 days ago, not the later one"


def test_anchor_too_old_to_carry_is_rejected(conn):
    add(conn, 600, 10)
    add(conn, 0, 90)
    windows = growth.compute(conn, "c1", TODAY)["windows"]
    assert "d90" not in windows, "a 600-day-old reading cannot stand in for 90 days ago"


def test_a_recent_anchor_is_not_flagged_stale(conn):
    add(conn, 95, 60)
    add(conn, 0, 72)
    w = growth.compute(conn, "c1", TODAY)["windows"]["d90"]
    assert w["stale"] is False


def test_growth_covers_the_labelled_window_even_with_an_old_anchor(conn):
    """A value unchanged for two years is still the value in force a year ago."""
    add(conn, 743, 20)
    add(conn, 0, 50)
    w = growth.compute(conn, "c1", TODAY)["windows"]["d365"]
    assert w["pct"] == pytest.approx(150.0)
    assert w["stale"] is True, "the reading behind it is far older than a year"


def test_decline_is_reported_as_negative(conn):
    add(conn, 90, 100)
    add(conn, 0, 80)
    w = growth.compute(conn, "c1", TODAY)["windows"]["d90"]
    assert w["delta"] == -20
    assert w["pct"] == pytest.approx(-20.0)


def test_sparkline_is_downsampled_but_keeps_the_endpoints(conn):
    for i in range(40):
        add(conn, 40 - i, 10 + i)
    spark = growth.compute(conn, "c1", TODAY)["spark"]
    assert len(spark) == growth.SPARK_POINTS
    assert spark[0] == 10
    assert spark[-1] == 49


def test_short_series_is_returned_whole(conn):
    add(conn, 7, 10)
    add(conn, 0, 12)
    assert growth.compute(conn, "c1", TODAY)["spark"] == [10, 12]
