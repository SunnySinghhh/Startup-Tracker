"""The 2019+ cohort filter."""

from __future__ import annotations

import pytest

from tracker.ingest import MIN_YEAR, _cohort_year, _recent_enough


@pytest.mark.parametrize(
    "company,expected",
    [
        ({"batch": "Winter 2024"}, 2024),
        ({"batch": "Summer 2019"}, 2019),
        ({"batch": None, "founded_date": "2021-06-01"}, 2021),
        ({"batch": "", "founded_date": ""}, None),
    ],
)
def test_cohort_year_prefers_batch_then_founded(company, expected):
    assert _cohort_year(company) == expected


def test_keeps_companies_from_the_cutoff_year_onward():
    assert _recent_enough({"origin": "yc", "batch": f"Winter {MIN_YEAR}"})
    assert _recent_enough({"origin": "yc", "batch": "Summer 2025"})


def test_excludes_older_batches():
    assert not _recent_enough({"origin": "yc", "batch": f"Winter {MIN_YEAR - 1}"})
    assert not _recent_enough({"origin": "yc", "batch": "Summer 2012"})


def test_excludes_companies_with_no_usable_year():
    assert not _recent_enough({"origin": "yc", "batch": None, "founded_date": None})


def test_custom_companies_are_always_kept():
    """They were added deliberately, so a cohort rule shouldn't drop them."""
    assert _recent_enough({"origin": "custom", "batch": None, "founded_date": "2012-01-01"})
