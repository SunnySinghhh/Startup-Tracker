"""GitHub activity — stars, contributors and repo counts for an org.

A genuine leading signal, but only for companies with public code: dev tools,
infrastructure, and open-source-adjacent startups. Most of the directory has
no GitHub presence at all, and that absence is recorded as "not measured"
rather than zero so the momentum score doesn't penalise a fintech for not
having a repo.

Orgs are never guessed. Searching GitHub by company name produces confident
nonsense — plenty of unrelated orgs share a name with a startup — so an org is
used only when it has been stated explicitly, either in
``data/custom-companies.json`` (``github_org``) or ``data/github-orgs.json``.

Unauthenticated requests are limited to 60/hour, which is why enrichment is
capped and prioritised. In CI, setting GITHUB_TOKEN raises this to 5,000/hour.
"""

from __future__ import annotations

import logging
import os
from datetime import date
from typing import Any

from .. import http, paths, store
from ..paths import DATA

log = logging.getLogger(__name__)

ORG_REPOS = "https://api.github.com/orgs/{org}/repos"
GITHUB_ORGS = DATA / "github-orgs.json"

# Unauthenticated: 60 req/hr. Authenticated: 5,000. Pace for the worse case.
_LIMITER = http.RateLimiter(per_second=2.0)


def _headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def org_map() -> dict[str, str]:
    """company_id -> github org, from both declaration sites."""
    mapping: dict[str, str] = {}

    # Inline on custom company entries.
    from .custom import normalise_company

    for entry in store.read_json(paths.CUSTOM_COMPANIES, default=[]) or []:
        org = entry.get("github_org")
        if org:
            mapping[normalise_company(entry)["id"]] = org

    # Standalone file, which is how YC companies get one.
    extra = store.read_json(GITHUB_ORGS, default={}) or {}
    for company_id, org in extra.items():
        if not company_id.startswith("_") and isinstance(org, str):
            mapping[company_id] = org

    return mapping


def fetch_org_stats(client, org: str) -> dict[str, Any] | None:
    """Aggregate public repo stats for an org.

    Only the first page (100 repos by stars) is read: it captures effectively
    all the signal, and paging every org would burn the rate limit for no gain.
    """
    resp = http.get_with_retry(
        client,
        ORG_REPOS.format(org=org),
        params={"per_page": 100, "sort": "updated", "type": "public"},
        headers=_headers(),
        limiter=_LIMITER,
    )
    if resp is None or resp.status_code != 200:
        if resp is not None and resp.status_code == 404:
            log.warning("github org not found: %s", org)
        elif resp is not None and resp.status_code == 403:
            log.warning("github rate limit hit at org %s — set GITHUB_TOKEN to raise it", org)
        return None

    try:
        repos = resp.json()
    except ValueError:
        return None
    if not isinstance(repos, list):
        return None

    stars = sum(r.get("stargazers_count") or 0 for r in repos)
    forks = sum(r.get("forks_count") or 0 for r in repos)
    return {
        "github_stars": stars,
        "github_forks": forks,
        "github_repos": len(repos),
    }


def run(today: date | None = None, limit: int = 60) -> dict[str, int]:
    today = today or date.today()
    paths.ensure_dirs()

    mapping = org_map()
    if not mapping:
        log.info("no github orgs declared — skipping")
        return {"github_targets": 0, "github_enriched": 0}

    watchlist = set(store.read_json(paths.WATCHLIST, default=[]) or [])
    # Watchlisted companies first; the rate limit makes ordering matter.
    ordered = sorted(mapping.items(), key=lambda kv: (kv[0] not in watchlist, kv[0]))[:limit]

    rows: list[dict[str, Any]] = []
    with http.client() as client:
        for company_id, org in ordered:
            stats = fetch_org_stats(client, org)
            if not stats:
                continue
            rows.append({"company_id": company_id, "snapshot_date": today.isoformat(),
                         "source": "github", **stats})

    if rows:
        store.upsert_partition(
            paths.SNAPSHOTS, today, rows, key=("company_id", "snapshot_date"), merge=True
        )

    log.info("GitHub: enriched %d of %d declared orgs", len(rows), len(ordered))
    return {"github_targets": len(ordered), "github_enriched": len(rows)}
