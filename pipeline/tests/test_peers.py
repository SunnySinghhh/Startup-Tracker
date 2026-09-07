"""Peer percentiles — context that turns a number into a judgment."""

from __future__ import annotations

from tracker import peers


def row(cid, sector, growth_pct=None, headcount=None, stage=None):
    r = {"id": cid, "sector": sector, "name": cid}
    if growth_pct is not None:
        r["growth"] = {"d365": {"pct": growth_pct, "from": 10, "to": 20, "delta": 10}}
    if headcount is not None:
        r["headcount"] = headcount
    if stage:
        r["fundingStage"] = stage
    return r


def test_no_percentiles_for_a_cohort_too_small_to_rank():
    """Being 'top 10%' of nine companies says more about the cohort."""
    rows = [row(f"c{i}", "Tiny", growth_pct=i) for i in range(5)]
    peers.annotate(rows)
    # Falls back to "all", which is also below the floor here.
    assert all("peers" not in r or not r["peers"]["metrics"] for r in rows)


def test_ranks_within_a_large_enough_cohort():
    rows = [row(f"c{i}", "B2B", growth_pct=i) for i in range(60)]
    peers.annotate(rows)
    best = next(r for r in rows if r["id"] == "c59")
    worst = next(r for r in rows if r["id"] == "c0")
    assert best["peers"]["metrics"]["growth"]["percentile"] == 100
    assert worst["peers"]["metrics"]["growth"]["percentile"] < 10
    assert best["peers"]["cohort"] == "B2B"


def test_companies_missing_the_metric_are_not_counted_as_zero():
    """Otherwise everyone else's percentile is inflated by the gaps."""
    with_growth = [row(f"g{i}", "B2B", growth_pct=10 + i) for i in range(30)]
    without = [row(f"n{i}", "B2B") for i in range(60)]
    rows = with_growth + without
    peers.annotate(rows)

    ranked = next(r for r in rows if r["id"] == "g0")
    assert ranked["peers"]["metrics"]["growth"]["n"] == 30, "only companies with the metric"

    # A company with nothing measurable gets no peer block at all, rather than
    # an empty table implying we ranked it and it came last.
    unranked = next(r for r in rows if r["id"] == "n0")
    assert "peers" not in unranked


def test_narrower_cohort_preferred_when_large_enough():
    rows = [row(f"a{i}", "B2B", growth_pct=i, stage="Seed") for i in range(40)]
    rows += [row(f"b{i}", "B2B", growth_pct=i, stage="Series A") for i in range(40)]
    peers.annotate(rows)
    assert next(r for r in rows if r["id"] == "a0")["peers"]["cohort"] == "B2B · Seed"


def test_median_is_reported_alongside_the_percentile():
    rows = [row(f"c{i}", "B2B", growth_pct=i) for i in range(41)]
    peers.annotate(rows)
    metric = rows[0]["peers"]["metrics"]["growth"]
    assert metric["median"] == 20, "middle of 0..40"
