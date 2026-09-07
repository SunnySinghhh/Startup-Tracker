"""Entity matching — the highest-risk logic in the pipeline.

Both matchers deliberately trade recall for precision. Attributing a funding
round or a headline to the wrong company produces confidently wrong data, which
is worse than a gap.
"""

from __future__ import annotations

import pytest

from tracker.sources import edgar, press


class TestEdgarNameMatching:
    @pytest.mark.parametrize(
        "company,entity",
        [
            ("Figma", "Figma, Inc.  (CIK 0001579878)"),
            ("Vercel", "Vercel Inc.  (CIK 0001893137)"),
            ("Databricks", "DataBricks, Inc.  (CIK 0001587468)"),
            ("Legora", "LEGORA INC (CIK 9)"),
        ],
    )
    def test_accepts_the_operating_company(self, company, entity):
        assert edgar._names_match(company, entity)

    @pytest.mark.parametrize(
        "company,entity,why",
        [
            ("Anthropic", "Anthropic T1V Syndicate AUG 2025 a Series of CGF2021 LLC",
             "syndicate SPV investing in the company, not the company"),
            ("Databricks", "DATABRICKS Oct 2025 a Series of Moreno VC LLC", "SPV"),
            ("Linear", "Linear Surgical Products VIII, LLC",
             "unrelated company sharing a prefix"),
            ("Cova", "COVA Acquisitions One, LLC", "acquisition vehicle"),
            ("Rippling", "FALCON XC VENTURES LLC", "full-text hit on an unrelated filing"),
            ("Acme", "Acme Real Estate Opportunity Fund II LLC", "fund"),
        ],
    )
    def test_rejects_vehicles_and_lookalikes(self, company, entity, why):
        assert not edgar._names_match(company, entity), why

    def test_rejects_names_too_short_to_be_distinctive(self):
        assert not edgar._names_match("Ivy", "Ivy Inc")


class TestPressMatching:
    @staticmethod
    def _item(title, summary=""):
        return [{"title": title, "summary": summary, "link": "https://x.test/1",
                 "published": "2026-09-06", "feed": "test"}]

    def test_matches_a_distinctive_name_in_the_headline(self, monkeypatch):
        monkeypatch.setattr(
            press, "_candidates",
            lambda: [("yc:legora", "Legora", press.re.compile(r"\bLegora\b"), False)],
        )
        signals = press.match_to_companies(
            self._item("What's driving Sweden's startup boom, from Lovable to Legora")
        )
        assert len(signals) == 1
        assert signals[0]["company_id"] == "yc:legora"
        assert signals[0]["confidence"] == "high"

    def test_rejects_an_investor_firm_of_the_same_name(self, monkeypatch):
        """'Cherry' the YC company vs 'Cherry Ventures' the VC firm."""
        monkeypatch.setattr(
            press, "_candidates",
            lambda: [("yc:cherry", "Cherry", press.re.compile(r"\bCherry\b"), False)],
        )
        signals = press.match_to_companies(
            self._item("Sweden's startup boom", "Cherry Ventures led the round")
        )
        assert signals == []

    def test_rejects_a_dictionary_word_without_nearby_funding_language(self, monkeypatch):
        """'The Builders Stage' must not become a funding signal for 'Stage'."""
        monkeypatch.setattr(
            press, "_candidates",
            lambda: [("yc:stage", "Stage", press.re.compile(r"\bStage\b"), True)],
        )
        signals = press.match_to_companies(
            self._item("The Builders Stage brings practical strategies to Disrupt",
                       "A panel on scaling teams.")
        )
        assert signals == []

    def test_is_case_sensitive_so_common_words_do_not_match(self, monkeypatch):
        monkeypatch.setattr(
            press, "_candidates",
            lambda: [("yc:welcome", "Welcome", press.re.compile(r"\bWelcome\b"), True)],
        )
        item = self._item("Tesla hits a snag", "welcome to the future")
        assert press.match_to_companies(item) == []
