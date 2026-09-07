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
