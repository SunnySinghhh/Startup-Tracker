"""SEC EDGAR — Form D filings.

Form D is the notice a US company files after raising from investors, so it is
the closest thing to an authoritative public record of private funding. It is
free, requires no key, and covers everyone raising in the US.

Its limits are worth being precise about, because they bound what this tracker
can honestly claim:
  * It is a *lagging* indicator — filed up to 15 days after the first sale.
  * It carries no valuation, and the amount is "total offering", not always the
    amount actually raised.
  * Non-US companies never appear.

Matching is the hard part. EDGAR full-text search matches inside the filing
document, so a query for "Rippling" returns filings from unrelated entities
that merely mention the word. Every hit is therefore re-checked against the
filing entity's own name before it is accepted.

SEC asks for a descriptive User-Agent with contact details and no more than
10 requests/second. Both are enforced here.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import date
from typing import Any

from .. import http, paths, store

log = logging.getLogger(__name__)

FULL_TEXT_SEARCH = "https://efts.sec.gov/LATEST/search-index"
SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:0>10}.json"

# SEC guidance is 10 req/sec; stay comfortably under it.
_LIMITER = http.RateLimiter(per_second=7.0)

_LEGAL_SUFFIXES = re.compile(
    r"\b(inc|inc\.|incorporated|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|company|"
    r"holdings|group|plc|gmbh|sa|nv|bv|pbc|lp|l\.p\.)\b\.?",
    re.IGNORECASE,
)
_NON_ALNUM = re.compile(r"[^a-z0-9]+")

# Entities that file Form D but are investment vehicles rather than operating
# companies. "Acme Real Estate Opportunity Fund II" is not the startup Acme,
# even though it shares a prefix — and funds file constantly, so letting these
# through would swamp the funding table with noise.
_VEHICLE_MARKERS = (
    "fund", "ventures", "venture", "capital", "partners", "trust", "reit",
    "spv", "opportunit", "investors", "investment", "syndicate",
    "acquisition", "holdings i", " vc ", "vc llc", "co-invest", "coinvest",
)

# The giveaway pattern for a syndicate SPV: "<Company> Oct 2025 a Series of
# CGF2021 LLC". These are vehicles pooling money to invest *in* the company,
# and they file constantly — 19 of them showed up for Anthropic alone.
_SERIES_OF_RE = re.compile(r"\ba series of\b", re.IGNORECASE)


def _normalise_entity(name: str) -> str:
    """Reduce a company name to a comparable core token string."""
    without_cik = re.sub(r"\s*\(CIK\s*\d+\)\s*$", "", name)
    stripped = _LEGAL_SUFFIXES.sub(" ", without_cik.lower())
    return _NON_ALNUM.sub("", stripped)


def _names_match(company_name: str, entity_name: str) -> bool:
    """Is this filing entity plausibly the company we searched for?

    The rule is strict by necessity: the entity name must reduce to exactly the
    company name once legal suffixes are stripped.

    Looser prefix matching was tried and produced badly wrong data. Searching
    "Anthropic" returned 19 syndicate SPVs ("Anthropic T1V Syndicate AUG 2025 a
    Series of CGF2021 LLC") which invest *in* Anthropic rather than being it,
    and "Linear" matched "Linear Surgical Products VIII, LLC". Attributing
    someone else's filing to a company is far worse than missing one.

    The cost is real: "Rippling" will not match "Rippling People Center Inc.",
    because that remainder is indistinguishable from the wrong-company case.
    ``data/edgar-cik-overrides.json`` exists for pinning those by hand.
    """
    a = _normalise_entity(company_name)
    b = _normalise_entity(entity_name)
    if not a or not b or len(a) < 4:
        return False

    entity_lower = entity_name.lower()
    company_lower = company_name.lower()
    if _SERIES_OF_RE.search(entity_lower):
        return False
    for marker in _VEHICLE_MARKERS:
        if marker in entity_lower and marker not in company_lower:
            return False

    return a == b


def search_form_d(client, company_name: str) -> list[dict[str, Any]]:
    """Full-text search for Form D filings mentioning this company."""
    resp = http.get_with_retry(
        client,
        FULL_TEXT_SEARCH,
        params={"q": f'"{company_name}"', "forms": "D"},
        limiter=_LIMITER,
    )
    if resp is None or resp.status_code != 200:
        return []
    try:
        payload = resp.json()
    except ValueError:
        return []

    hits = payload.get("hits", {}).get("hits", [])
    accepted = []
    for hit in hits:
        source = hit.get("_source", {})
        display_names = source.get("display_names") or []
        if not any(_names_match(company_name, name) for name in display_names):
            continue
        accepted.append(
            {
                "entity": display_names[0] if display_names else None,
                "ciks": source.get("ciks") or [],
                "accession": (hit.get("_id") or "").split(":")[0],
                "filed": source.get("file_date") or source.get("filed_date"),
            }
        )
    return accepted


def _round_type_from_history(index: int, total: int) -> str:
    """Best-effort stage label.

    Form D does not state the round name, so this is inferred from filing order
    and labelled as inferred everywhere it surfaces. It is a convenience, not a
    fact from the filing.
    """
    ladder = ["Seed", "Series A", "Series B", "Series C", "Series D+"]
    position = total - 1 - index
    return ladder[min(position, len(ladder) - 1)]


def filings_for_cik(client, cik: str) -> list[dict[str, Any]]:
    """All Form D filings for a known CIK, bypassing name matching entirely.

    This is the escape hatch for companies whose EDGAR entity name doesn't
    match their trading name. Pinning the CIK is unambiguous, so no heuristic
    is needed once you've done it.
    """
    resp = http.get_with_retry(client, SUBMISSIONS.format(cik=cik), limiter=_LIMITER)
    if resp is None or resp.status_code != 200:
        return []
    try:
        payload = resp.json()
    except ValueError:
        return []

    recent = payload.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    entity = payload.get("name")

    out = []
    for form, filed, accession in zip(forms, dates, accessions, strict=False):
        if not str(form).startswith("D"):
            continue
        out.append({"entity": entity, "ciks": [cik], "accession": accession, "filed": filed})
    return out


def _load_overrides() -> dict[str, str]:
    raw = store.read_json(paths.EDGAR_OVERRIDES, default={}) or {}
    overrides = raw.get("overrides", {}) if isinstance(raw, dict) else {}
    return {k: str(v) for k, v in overrides.items() if not k.startswith("_")}


def run(today: date | None = None, limit: int = 60) -> dict[str, int]:
    """Enrich a bounded set of companies with Form D data.

    Per-company API calls make full-universe coverage impossible, so this
    targets the watchlist and custom companies first — the ones you actually
    care about — and fills any remaining budget with a rotating slice so
    coverage broadens over successive runs.
    """
    today = today or date.today()
    paths.ensure_dirs()

    companies = store.read_json(paths.COMPANIES, default=[])
    targets = _select_targets(companies, limit, today)
    # Pinned companies are always worth checking, budget permitting.
    for pinned in _load_overrides():
        if pinned not in targets:
            targets.insert(0, pinned)
    if not targets:
        return {"edgar_targets": 0, "edgar_rounds": 0}

    by_id = {c["id"]: c for c in companies}
    overrides = _load_overrides()
    existing = {r["id"] for r in store.read_jsonl(paths.FUNDING)}
    new_rounds: list[dict[str, Any]] = []
    matched_companies = 0

    with http.client() as client:
        for company_id in targets:
            company = by_id.get(company_id)
            if not company:
                continue
            pinned_cik = overrides.get(company_id)
            hits = (
                filings_for_cik(client, pinned_cik)
                if pinned_cik
                else search_form_d(client, company["name"])
            )
            if not hits:
                continue
            matched_companies += 1

            hits.sort(key=lambda h: h.get("filed") or "", reverse=True)
            for index, hit in enumerate(hits):
                digest = hashlib.sha1(
                    f"{company_id}|{hit['accession']}".encode()
                ).hexdigest()[:16]
                round_id = f"formd:{digest}"
                if round_id in existing:
                    continue
                cik = hit["ciks"][0] if hit["ciks"] else None
                new_rounds.append(
                    {
                        "id": round_id,
                        "company_id": company_id,
                        "round_type": _round_type_from_history(index, len(hits)),
                        "amount_raised": None,  # not in the search index
                        "currency": "USD",
                        "announced_date": hit.get("filed"),
                        "lead_investor": None,
                        "other_investors": [],
                        "source_url": (
                            f"https://www.sec.gov/Archives/edgar/data/{cik}/"
                            f"{hit['accession'].replace('-', '')}/"
                            if cik
                            else None
                        ),
                        "source_type": "form_d",
                        "cik": cik,
                        "accession_no": hit["accession"],
                        "entity_name": hit.get("entity"),
                        "round_type_inferred": True,
                    }
                )

    if new_rounds:
        with paths.FUNDING.open("a", encoding="utf-8") as fh:
            import json

            for row in new_rounds:
                fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

    log.info(
        "EDGAR: checked %d companies, matched %d, added %d filings",
        len(targets), matched_companies, len(new_rounds),
    )
    return {
        "edgar_targets": len(targets),
        "edgar_matched": matched_companies,
        "edgar_rounds": len(new_rounds),
    }


def _select_targets(companies: list[dict[str, Any]], limit: int, today: date) -> list[str]:
    """Watchlist and custom companies first, then a rotating slice."""
    watchlist = set(store.read_json(paths.WATCHLIST, default=[]) or [])

    priority = [
        c["id"] for c in companies
        if c["id"] in watchlist or c.get("origin") == "custom"
    ]
    if len(priority) >= limit:
        return priority[:limit]

    # Rotate deterministically by day so successive runs cover new ground.
    rest = [c["id"] for c in companies if c["id"] not in set(priority)]
    if not rest:
        return priority
    offset = (today.toordinal() * limit) % len(rest)
    remaining = limit - len(priority)
    rotated = rest[offset:] + rest[:offset]
    return priority + rotated[:remaining]
