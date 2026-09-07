"""Append-only JSONL storage.

Time-series rows (metric snapshots, signals) are written to month-partitioned
JSONL files. This is deliberate: the ingestion job runs on a schedule and
commits its output, so the storage format has to produce *append-only diffs*.
A binary SQLite file would store a full copy in git history on every run.

Writes are idempotent per (natural key, day) so re-running ingestion on the
same day updates in place rather than duplicating rows.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from datetime import date
from pathlib import Path
from typing import Any


def _partition(root: Path, day: date) -> Path:
    return root / f"{day.year:04d}-{day.month:02d}.jsonl"


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    if not path.exists():
        return
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def read_all(root: Path) -> Iterator[dict[str, Any]]:
    """Read every partition under ``root`` in chronological order."""
    if not root.exists():
        return
    for path in sorted(root.glob("*.jsonl")):
        yield from read_jsonl(path)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            n += 1
    return n


def upsert_partition(
    root: Path,
    day: date,
    rows: Iterable[dict[str, Any]],
    key: tuple[str, ...],
    *,
    merge: bool = False,
) -> int:
    """Merge ``rows`` into the partition for ``day``. Safe to re-run per day.

    ``merge`` controls what happens when an incoming row collides with a stored
    one. It must be True for metric snapshots and False for signals:

    Several sources each contribute *part* of a snapshot for the same
    (company, date) key — the YC directory supplies headcount, GitHub supplies
    stars. Replacing the whole row means whichever source runs last erases the
    others' fields, which silently destroyed real headcount history in testing.
    Merging keeps every source's contribution.

    Signals are whole records identified by a content hash, so replacement is
    correct there — a re-fetched signal should overwrite, not accumulate keys.
    """
    path = _partition(root, day)
    existing = {tuple(r.get(k) for k in key): r for r in read_jsonl(path)}
    incoming = list(rows)

    for row in incoming:
        row_key = tuple(row.get(k) for k in key)
        prior = existing.get(row_key)
        if merge and prior:
            # Incoming values win, but only where the incoming row actually
            # carries a value — None must not overwrite a real observation.
            combined = dict(prior)
            combined.update({k: v for k, v in row.items() if v is not None})
            existing[row_key] = combined
        else:
            existing[row_key] = row

    ordered = sorted(existing.values(), key=lambda r: tuple(str(r.get(k, "")) for k in key))
    write_jsonl(path, ordered)
    return len(incoming)


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path.write_text(text, encoding="utf-8")


# --- Change-only snapshot storage ------------------------------------------
#
# Headcount is a step function: it holds its value until it changes. Recording
# an identical row for every company every day stored ~324,000 observations
# where ~16,500 carried information — 95% of it repetition, and about 174MB of
# git growth a year. Only transitions are kept; readers carry the last value
# forward (see tracker.growth).
#
# Note this makes a snapshot date mean "when the value changed", not "when we
# last looked". Freshness of the *check* lives on the company record's
# ``last_seen``, so both questions stay answerable.

# Fields whose change makes an observation worth storing.
TRACKED_FIELDS = (
    "headcount", "is_hiring", "github_stars", "github_contributors",
    "github_commits_30d", "github_forks", "github_repos", "press_mentions_30d",
)


def _signature(row: dict[str, Any]) -> tuple:
    return tuple(row.get(f) for f in TRACKED_FIELDS)


def latest_signatures(root: Path) -> dict[str, tuple]:
    """The most recent stored signature per company."""
    latest: dict[str, tuple[str, tuple]] = {}
    for row in read_all(root):
        company_id = row.get("company_id")
        when = row.get("snapshot_date")
        if not company_id or not when:
            continue
        prior = latest.get(company_id)
        if prior is None or when >= prior[0]:
            latest[company_id] = (when, _signature(row))
    return {cid: sig for cid, (_, sig) in latest.items()}


def drop_unchanged(rows: Iterable[dict[str, Any]], known: dict[str, tuple]) -> list[dict[str, Any]]:
    """Keep only rows whose tracked values differ from the last stored one."""
    out = []
    for row in rows:
        company_id = row.get("company_id")
        if company_id is None:
            continue
        if known.get(company_id) == _signature(row):
            continue
        out.append(row)
    return out


def compact(root: Path) -> tuple[int, int]:
    """Rewrite every partition keeping only transitions plus each latest row.

    The latest row per company is always kept so "current value" never has to
    be inferred from an arbitrarily old transition.
    """
    all_rows = list(read_all(root))
    by_company: dict[str, list[dict[str, Any]]] = {}
    for row in all_rows:
        by_company.setdefault(row["company_id"], []).append(row)

    keep: list[dict[str, Any]] = []
    for rows in by_company.values():
        rows.sort(key=lambda r: r["snapshot_date"])
        previous = object()
        for index, row in enumerate(rows):
            signature = _signature(row)
            if signature != previous or index == len(rows) - 1:
                keep.append(row)
                previous = signature

    partitions: dict[str, list[dict[str, Any]]] = {}
    for row in keep:
        partitions.setdefault(row["snapshot_date"][:7], []).append(row)

    for path in root.glob("*.jsonl"):
        path.unlink()
    for month, rows in partitions.items():
        rows.sort(key=lambda r: (r["company_id"], r["snapshot_date"]))
        write_jsonl(root / f"{month}.jsonl", rows)

    return len(all_rows), len(keep)
