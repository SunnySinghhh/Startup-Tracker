"""Y Combinator directory — the seed universe.

Source: the yc-oss/api project, which publishes YC's public company directory
as static JSON on GitHub Pages. One request gets all ~6.2k companies, which is
why a daily full refresh of the whole universe is cheap.

Two fields here are unusually valuable:
  team_size — a headcount figure we can legitimately snapshot over time. This
              is the compliant substitute for LinkedIn headcount scraping.
  isHiring  — YC's own "currently hiring" flag, a live demand signal.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from .. import http, location

ALL_COMPANIES_URL = "https://yc-oss.github.io/api/companies/all.json"


def fetch(url: str = ALL_COMPANIES_URL) -> list[dict[str, Any]]:
    with http.client() as c:
        resp = http.get_with_retry(c, url)
        if resp is None or resp.status_code != 200:
            raise RuntimeError(f"YC directory fetch failed (url={url})")
        return resp.json()


def _founded_date(raw: dict[str, Any]) -> str | None:
    """YC exposes ``launched_at`` (unix seconds).

    Caveat worth knowing: this is the company's *launch/listing* timestamp, not
    its incorporation date. It's the best public proxy YC gives us, but don't
    read it as a legal founding date.
    """
    ts = raw.get("launched_at")
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=UTC).date().isoformat()
    except (ValueError, OSError, OverflowError):
        return None


def _sub_sector(raw: dict[str, Any]) -> str | None:
    """YC formats subindustry as "Parent -> Child"; the parent duplicates ``sector``."""
    value = raw.get("subindustry")
    if not value:
        return None
    return value.split("->")[-1].strip() or None


def _location_fields(raw_location: str | None) -> dict[str, Any]:
    """Filterable location fields parsed out of YC's free-text string."""
    parsed = location.parse(raw_location)
    return {
        "city": parsed["city"],
        "country": parsed["country"],
        "countries": parsed["countries"],
        "remote": parsed["remote"],
    }


def normalise_company(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"yc:{raw['slug']}",
        "name": raw["name"],
        "one_liner": raw.get("one_liner") or None,
        "long_description": raw.get("long_description") or None,
        "website": raw.get("website") or None,
        "sector": raw.get("industry") or "Unspecified",
        "sub_sector": _sub_sector(raw),
        "tags": raw.get("tags") or [],
        "hq_location": raw.get("all_locations") or None,
        "regions": raw.get("regions") or [],
        **_location_fields(raw.get("all_locations")),
        "founded_date": _founded_date(raw),
        "status": raw.get("status") or "Active",
        "stage": raw.get("stage") or None,
        "batch": raw.get("batch") or None,
        "logo_url": raw.get("small_logo_thumb_url") or None,
        "profile_url": raw.get("url") or None,
        "origin": "yc",
        "top_company": 1 if raw.get("top_company") else 0,
        "notes": None,
    }


def normalise_snapshot(raw: dict[str, Any], day: date) -> dict[str, Any]:
    team_size = raw.get("team_size")
    return {
        "company_id": f"yc:{raw['slug']}",
        "snapshot_date": day.isoformat(),
        "headcount": int(team_size) if isinstance(team_size, int | float) and team_size else None,
        "is_hiring": 1 if raw.get("isHiring") else 0,
        "source": "yc",
    }
