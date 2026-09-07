"""Storage semantics — especially the merge behaviour that partial snapshots rely on."""

from __future__ import annotations

from datetime import date

from tracker import store

DAY = date(2026, 9, 6)
KEY = ("company_id", "snapshot_date")


def test_merge_preserves_fields_from_other_sources(tmp_path):
    """Regression: GitHub enrichment used to erase headcount.

    Each source writes a partial snapshot for the same (company, date) key.
    Without merging, whichever ran last wiped the other's fields — which
    silently destroyed real headcount history.
    """
    store.upsert_partition(
        tmp_path, DAY,
        [{"company_id": "yc:posthog", "snapshot_date": "2026-09-06", "headcount": 150}],
        key=KEY, merge=True,
    )
    store.upsert_partition(
        tmp_path, DAY,
        [{"company_id": "yc:posthog", "snapshot_date": "2026-09-06", "github_stars": 45304}],
        key=KEY, merge=True,
    )

    rows = list(store.read_all(tmp_path))
    assert len(rows) == 1
    assert rows[0]["headcount"] == 150
    assert rows[0]["github_stars"] == 45304


def test_merge_does_not_let_none_overwrite_a_real_value(tmp_path):
    store.upsert_partition(
        tmp_path, DAY,
        [{"company_id": "a", "snapshot_date": "2026-09-06", "headcount": 42}],
        key=KEY, merge=True,
    )
    store.upsert_partition(
        tmp_path, DAY,
        [{"company_id": "a", "snapshot_date": "2026-09-06", "headcount": None, "is_hiring": 1}],
        key=KEY, merge=True,
    )
    rows = list(store.read_all(tmp_path))
    assert rows[0]["headcount"] == 42
    assert rows[0]["is_hiring"] == 1


def test_replace_mode_overwrites_whole_row(tmp_path):
    """Signals are whole records keyed by content hash — replacement is correct."""
    store.upsert_partition(
        tmp_path, DAY, [{"id": "s1", "title": "old", "extra": "gone"}], key=("id",)
    )
    store.upsert_partition(tmp_path, DAY, [{"id": "s1", "title": "new"}], key=("id",))

    rows = list(store.read_all(tmp_path))
    assert rows == [{"id": "s1", "title": "new"}]


def test_reingesting_the_same_day_is_idempotent(tmp_path):
    row = {"company_id": "a", "snapshot_date": "2026-09-06", "headcount": 10}
    for _ in range(3):
        store.upsert_partition(tmp_path, DAY, [row], key=KEY, merge=True)
    assert len(list(store.read_all(tmp_path))) == 1
