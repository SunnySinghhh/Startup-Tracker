"""Parsing YC's location strings into filterable fields.

YC gives one free-text string per company, and it carries three different
things at once:

    "San Francisco, CA, USA"
    "San Francisco, CA, USA; Remote"
    "New York City, NY, USA; San Francisco, CA, USA"
    "Mexico City, CDMX, Mexico; Santiago, ..., Chile; Bogotá, ..., Colombia"

Semicolons separate distinct offices, commas separate city/region/country
within one, and "Remote" appears as a pseudo-location rather than a flag.

The `regions` array YC also provides is *not* used for the country facet: it
mixes continents ("Europe"), countries ("India"), and remote status
("Fully Remote") in one list, so it can't be filtered on coherently.
"""

from __future__ import annotations

# Canonical names for the variants YC actually emits, so "USA" and
# "United States of America" don't appear as two separate filter options.
_COUNTRY_ALIASES = {
    "usa": "United States",
    "us": "United States",
    "u.s.a.": "United States",
    "united states of america": "United States",
    "united states": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "great britain": "United Kingdom",
    "england": "United Kingdom",
    "scotland": "United Kingdom",
    "wales": "United Kingdom",
    "uae": "United Arab Emirates",
    "korea": "South Korea",
    "republic of korea": "South Korea",
    "russian federation": "Russia",
    "viet nam": "Vietnam",
    "czechia": "Czech Republic",
    "the netherlands": "Netherlands",
}

_REMOTE_TOKENS = {"remote", "fully remote", "partly remote"}


def _canonical_country(value: str) -> str:
    cleaned = value.strip().rstrip(".")
    return _COUNTRY_ALIASES.get(cleaned.lower(), cleaned)


def parse(raw: str | None) -> dict[str, object]:
    """Split a YC location string into city, country, remote and every country.

    Returns the *primary* (first listed) office for city/country, plus the full
    country set so a company with offices in several places is findable under
    each of them.
    """
    if not raw or not raw.strip():
        return {"city": None, "country": None, "countries": [], "remote": False}

    entries = [e.strip() for e in raw.split(";") if e.strip()]
    remote = any(e.lower() in _REMOTE_TOKENS for e in entries)
    places = [e for e in entries if e.lower() not in _REMOTE_TOKENS]

    if not places:
        # "Remote" was the entire location — real for distributed companies.
        return {"city": None, "country": None, "countries": [], "remote": remote}

    def split_entry(entry: str) -> tuple[str | None, str | None]:
        segments = [s.strip() for s in entry.split(",") if s.strip()]
        if not segments:
            return None, None
        if len(segments) == 1:
            # A lone segment is a country ("Singapore"), not a city — YC always
            # includes a country when it names a city.
            return None, _canonical_country(segments[0])
        return segments[0], _canonical_country(segments[-1])

    city, country = split_entry(places[0])

    countries: list[str] = []
    for entry in places:
        _, entry_country = split_entry(entry)
        if entry_country and entry_country not in countries:
            countries.append(entry_country)

    return {"city": city, "country": country, "countries": countries, "remote": remote}
