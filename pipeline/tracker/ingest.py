"""Ingestion — fetch from sources, write to the append-only store under data/.

Design rule: ingestion only ever *writes raw observations*. It never computes
derived values. That keeps the scheduled job dumb and idempotent — if the
scoring logic changes, you re-run ``build``, not ``ingest``, and no history is
lost or rewritten.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from . import paths, store
from .sources import custom, yc

log = logging.getLogger(__name__)


def _merge_directory(companies: list[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    """Merge freshly-fetched companies into the persisted directory.

    Preserves ``first_seen`` across runs — that timestamp is the only record of
    when a company entered our universe, and it can't be recovered if lost.
    Companies that disappear from a source are kept, not deleted: a company
    vanishing from the YC directory is itself a signal worth retaining.
    """
    existing = {c["id"]: c for c in store.read_json(paths.COMPANIES, default=[])}
    iso = today.isoformat()

    for company in companies:
        prior = existing.get(company["id"])
        company["first_seen"] = prior.get("first_seen", iso) if prior else iso
        company["last_seen"] = iso
        # Never let an automated refresh clobber notes typed by hand.
        if prior and prior.get("notes") and not company.get("notes"):
            company["notes"] = prior["notes"]
        existing[company["id"]] = company

    return sorted(existing.values(), key=lambda c: c["name"].lower())


def ingest_directory(today: date | None = None) -> dict[str, int]:
    """Refresh the company universe (YC + custom) and snapshot headcount."""
    today = today or date.today()
    paths.ensure_dirs()

    raw_yc = yc.fetch()
    log.info("fetched %d companies from YC directory", len(raw_yc))

    yc_companies = [yc.normalise_company(r) for r in raw_yc]
    yc_snapshots = [yc.normalise_snapshot(r, today) for r in raw_yc]

    custom_companies = custom.fetch()
    log.info("loaded %d custom (non-YC) companies", len(custom_companies))

    merged = _merge_directory(yc_companies + custom_companies, today)
    store.write_json(paths.COMPANIES, merged)

    written = store.upsert_partition(
        paths.SNAPSHOTS, today, yc_snapshots, key=("company_id", "snapshot_date"), merge=True
    )

    return {
        "companies_total": len(merged),
        "companies_yc": len(yc_companies),
        "companies_custom": len(custom_companies),
        "snapshots_written": written,
    }


def record_signals(rows: list[dict[str, Any]], today: date | None = None) -> int:
    """Append event-log rows, de-duplicated on their stable ``id``."""
    if not rows:
        return 0
    today = today or date.today()
    paths.ensure_dirs()
    return store.upsert_partition(paths.SIGNALS, today, rows, key=("id",))
