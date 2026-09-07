"""Backfill historical headcount from the YC data source's own git history.

The tracker's central question is "what is *happening* with this company",
which needs a time series. Collecting one observation a day means waiting
months before the product can answer that at all.

The yc-oss/api repository publishes the YC directory as JSON and commits it
daily, so its git history *is* a headcount time series going back to August
2024. Reading `companies/all.json` at past commits recovers roughly two years
of `team_size` per company in a couple of minutes.

Two things make this cheap enough to be practical:
  * the file is ~10MB raw but ~2MB gzipped, and raw.githubusercontent.com
    serves it compressed;
  * weekly sampling is plenty for charts — daily points would be noise, since
    YC updates team_size irregularly anyway.

The resulting rows are marked ``source: yc-history`` so they stay
distinguishable from observations this tracker made itself.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from datetime import date, datetime
from typing import Any

from .. import http, paths, store

log = logging.getLogger(__name__)

COMMITS_URL = "https://api.github.com/repos/yc-oss/api/commits"
RAW_URL = "https://raw.githubusercontent.com/yc-oss/api/{sha}/companies/all.json"
TRACKED_PATH = "companies/all.json"

# Polite pacing for raw.githubusercontent; it is a CDN but this is a bulk read.
_LIMITER = http.RateLimiter(per_second=4.0)


def _headers() -> dict[str, str]:
    token = os.environ.get("GITHUB_TOKEN")
    return {"Authorization": f"Bearer {token}"} if token else {}


def list_commits(client, max_pages: int = 10) -> list[tuple[str, date]]:
    """Every commit that touched the companies file, newest first."""
    out: list[tuple[str, date]] = []
    for page in range(1, max_pages + 1):
        resp = http.get_with_retry(
            client,
            COMMITS_URL,
            params={"per_page": 100, "page": page, "path": TRACKED_PATH},
            headers=_headers(),
        )
        if resp is None or resp.status_code != 200:
            break
        batch = resp.json()
        if not isinstance(batch, list) or not batch:
            break
        for commit in batch:
            stamp = commit["commit"]["committer"]["date"][:10]
            try:
                out.append((commit["sha"], date.fromisoformat(stamp)))
            except ValueError:
                continue
        if len(batch) < 100:
            break
    return out


def sample_weekly(commits: list[tuple[str, date]]) -> list[tuple[str, date]]:
    """One commit per ISO week — the newest in each week.

    YC refreshes team_size on its own irregular schedule, so daily points would
    mostly be flat repeats. Weekly keeps the series honest and the charts
    readable.
    """
    seen: set[tuple[int, int]] = set()
    picked: list[tuple[str, date]] = []
    for sha, when in sorted(commits, key=lambda c: c[1], reverse=True):
        key = when.isocalendar()[:2]
        if key in seen:
            continue
        seen.add(key)
        picked.append((sha, when))
    return sorted(picked, key=lambda c: c[1])


def fetch_snapshot(client, sha: str) -> list[dict[str, Any]] | None:
    resp = http.get_with_retry(client, RAW_URL.format(sha=sha), limiter=_LIMITER)
    if resp is None or resp.status_code != 200:
        return None
    try:
        payload = resp.json()
    except ValueError:
        return None
    return payload if isinstance(payload, list) else None


def _rows_for(raw: list[dict[str, Any]], when: date, keep: set[str]) -> Iterator[dict[str, Any]]:
    for company in raw:
        slug = company.get("slug")
        if not slug:
            continue
        company_id = f"yc:{slug}"
        if company_id not in keep:
            continue
        team_size = company.get("team_size")
        if not isinstance(team_size, int | float) or not team_size:
            continue
        yield {
            "company_id": company_id,
            "snapshot_date": when.isoformat(),
            "headcount": int(team_size),
            "is_hiring": 1 if company.get("isHiring") else 0,
            "source": "yc-history",
        }


def run(limit: int | None = None) -> dict[str, int]:
    """Fetch weekly historical snapshots and merge them into the store."""
    paths.ensure_dirs()

    companies = store.read_json(paths.COMPANIES, default=[])
    keep = {c["id"] for c in companies if c.get("origin") == "yc"}
    if not keep:
        raise RuntimeError("no YC companies in the directory — run the ingest first")

    with http.client() as client:
        commits = list_commits(client)
        if not commits:
            raise RuntimeError("could not list commits for the YC data repository")

        weekly = sample_weekly(commits)
        if limit:
            weekly = weekly[-limit:]
        log.info(
            "%d commits available, sampling %d weekly points (%s to %s)",
            len(commits), len(weekly), weekly[0][1], weekly[-1][1],
        )

        # Group rows by month so each partition is written once, not per commit.
        by_month: dict[tuple[int, int], list[dict[str, Any]]] = {}
        fetched = 0

        for index, (sha, when) in enumerate(weekly, start=1):
            raw = fetch_snapshot(client, sha)
            if raw is None:
                log.warning("skipping unreadable snapshot %s (%s)", sha[:8], when)
                continue
            rows = list(_rows_for(raw, when, keep))
            by_month.setdefault((when.year, when.month), []).extend(rows)
            fetched += 1
            if index % 20 == 0:
                log.info("  %d/%d snapshots fetched", index, len(weekly))

    written = 0
    for (year, month), rows in sorted(by_month.items()):
        written += store.upsert_partition(
            paths.SNAPSHOTS, date(year, month, 1), rows,
            key=("company_id", "snapshot_date"), merge=True,
        )

    return {
        "commits_seen": len(commits),
        "snapshots_fetched": fetched,
        "observations_written": written,
        "months_touched": len(by_month),
    }


def latest_change_date() -> str:
    return datetime.now().date().isoformat()
