"""Hand-curated companies from outside the YC universe.

The YC directory is a great seed list but it is not the whole market. This
source loads ``data/custom-companies.json`` — a file you edit by hand — and
normalises entries into exactly the same shape as YC records, so the rest of
the pipeline and the entire UI treat them identically.

Only ``name`` is required. Anything you omit simply renders as unknown; the
dashboard is built to degrade gracefully rather than show empty scaffolding.
"""

from __future__ import annotations

import re
from typing import Any

from .. import store
from ..paths import CUSTOM_COMPANIES

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-")


def normalise_company(raw: dict[str, Any]) -> dict[str, Any]:
    name = raw.get("name")
    if not name:
        raise ValueError(f"custom company entry is missing required field 'name': {raw!r}")
    slug = raw.get("id") or slugify(name)
    return {
        "id": f"custom:{slug}",
        "name": name,
        "one_liner": raw.get("one_liner") or None,
        "long_description": raw.get("long_description") or None,
        "website": raw.get("website") or None,
        "sector": raw.get("sector") or "Unspecified",
        "sub_sector": raw.get("sub_sector") or None,
        "tags": raw.get("tags") or [],
        "hq_location": raw.get("hq_location") or None,
        "regions": raw.get("regions") or [],
        "founded_date": raw.get("founded_date") or None,
        "status": raw.get("status") or "Active",
        "stage": raw.get("stage") or None,
        "batch": None,
        "logo_url": raw.get("logo_url") or None,
        "profile_url": raw.get("website") or None,
        "origin": "custom",
        "top_company": 1 if raw.get("top_company") else 0,
        "notes": raw.get("notes") or None,
    }


def load() -> list[dict[str, Any]]:
    """Return raw entries as written in the file (pre-normalisation)."""
    entries = store.read_json(CUSTOM_COMPANIES, default=[])
    if not isinstance(entries, list):
        raise ValueError(f"{CUSTOM_COMPANIES} must contain a JSON array")
    return entries


def fetch() -> list[dict[str, Any]]:
    return [normalise_company(e) for e in load()]
