"""Ingestion — fetch from sources, write to the append-only store under data/.

Design rule: ingestion only ever *writes raw observations*. It never computes
derived values. That keeps the scheduled job dumb and idempotent — if the
scoring logic changes, you re-run ``build``, not ``ingest``, and no history is
lost or rewritten.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

from . import paths, store
from .sources import custom, yc

log = logging.getLogger(__name__)

# Only track companies from this batch year onward. Older YC batches are mostly
# long-since exited or dormant, and excluding them roughly a third of the
# universe without losing anything the tracker is actually watching for.
MIN_YEAR = 2019

_YEAR_RE = re.compile(r"(\d{4})")


def _cohort_year(company: dict[str, Any]) -> int | None:
    """Best available year for a company: YC batch first, then founded date."""
    batch = company.get("batch") or ""
    match = _YEAR_RE.search(batch)
    if match:
        return int(match.group(1))
    founded = company.get("founded_date") or ""
    return int(founded[:4]) if founded[:4].isdigit() else None


def _recent_enough(company: dict[str, Any]) -> bool:
    """Custom companies are always kept — they were added on purpose."""
    if company.get("origin") == "custom":
        return True
    year = _cohort_year(company)
    return year is not None and year >= MIN_YEAR


def _merge_directory(companies: list[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    """Merge freshly-fetched companies into the persisted directory.

    Preserves ``first_seen`` across runs — that timestamp is the only record of
    when a company entered our universe, and it can't be recovered if lost.
    Companies that disappear from a source are kept, not deleted: a company
    vanishing from the YC directory is itself a signal worth retaining.
    """
    existing = {c["id"]: c for c in store.read_json(paths.COMPANIES, default=[])}
    iso = today.isoformat()

    # Prune anything the cohort filter now excludes. Without this, companies
    # stored by an earlier, wider run would linger indefinitely.
    for company_id in [cid for cid, c in existing.items() if not _recent_enough(c)]:
        del existing[company_id]

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

    all_yc = [yc.normalise_company(r) for r in raw_yc]
    yc_companies = [c for c in all_yc if _recent_enough(c)]
    kept_ids = {c["id"] for c in yc_companies}
    log.info(
        "kept %d of %d YC companies (batch year >= %d)",
        len(yc_companies), len(all_yc), MIN_YEAR,
    )

    yc_snapshots = [
        snap for snap in (yc.normalise_snapshot(r, today) for r in raw_yc)
        if snap["company_id"] in kept_ids
    ]

    custom_companies = custom.fetch()
    log.info("loaded %d custom (non-YC) companies", len(custom_companies))

    merged = _merge_directory(yc_companies + custom_companies, today)
    store.write_json(paths.COMPANIES, merged)

    written = store.upsert_partition(
        paths.SNAPSHOTS, today, yc_snapshots, key=("company_id", "snapshot_date"), merge=True
    )

    return {
        "companies_total": len(merged),
        "companies_excluded_older": len(all_yc) - len(yc_companies),
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
