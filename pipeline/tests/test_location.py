"""Location parsing — the source strings are messier than they look."""

from __future__ import annotations

import pytest

from tracker import location


@pytest.mark.parametrize(
    "raw,city,country",
    [
        ("San Francisco, CA, USA", "San Francisco", "United States"),
        ("Bengaluru, KA, India", "Bengaluru", "India"),
        ("London, England, United Kingdom", "London", "United Kingdom"),
        ("Singapore", None, "Singapore"),
        ("LA, Nigeria", "LA", "Nigeria"),
    ],
)
def test_parses_city_and_country(raw, city, country):
    parsed = location.parse(raw)
    assert parsed["city"] == city
    assert parsed["country"] == country


def test_normalises_country_aliases_to_one_name():
    """USA and United States of America must not become two filter options."""
    assert location.parse("X, CA, USA")["country"] == "United States"
    assert location.parse("X, CA, United States of America")["country"] == "United States"
    assert location.parse("X, England, England")["country"] == "United Kingdom"


def test_remote_is_a_flag_not_a_country():
    parsed = location.parse("San Francisco, CA, USA; Remote")
    assert parsed["remote"] is True
    assert parsed["country"] == "United States"
    assert "Remote" not in parsed["countries"]


def test_fully_remote_company_has_no_country():
    parsed = location.parse("Remote")
    assert parsed["remote"] is True
    assert parsed["country"] is None
    assert parsed["countries"] == []


def test_multi_office_company_lists_every_country():
    parsed = location.parse(
        "Mexico City, CDMX, Mexico; Santiago, Santiago Metropolitan Region, Chile; "
        "Bogotá, Bogota, Colombia"
    )
    assert parsed["country"] == "Mexico", "primary office leads"
    assert parsed["countries"] == ["Mexico", "Chile", "Colombia"]


def test_repeated_country_is_not_duplicated():
    parsed = location.parse("New York City, NY, USA; San Francisco, CA, USA")
    assert parsed["countries"] == ["United States"]


@pytest.mark.parametrize("raw", [None, "", "   "])
def test_missing_location_is_handled(raw):
    parsed = location.parse(raw)
    assert parsed == {"city": None, "country": None, "countries": [], "remote": False}
