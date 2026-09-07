"""Peer-relative context: where a company sits within a comparable cohort.

"+32% headcount" is a number; "+32%, top 8% of its cohort" is a judgment. This
module supplies the second by ranking each company against companies it is
actually comparable to.

Two rules keep the percentiles honest:

*A cohort must be big enough to rank against.* Below a floor, a percentile is
noise dressed as precision — being "top 10%" of nine companies means very
little. Small cohorts fall back to a broader one, and the cohort actually used
is reported so the UI can name it.

*Only companies with the metric are ranked.* A company with no headcount
reading is excluded from the headcount ranking rather than treated as zero,
which would push everyone else's percentile up.
"""

from __future__ import annotations

from typing import Any

# Below this, a percentile says more about the cohort's size than the company.
MIN_COHORT = 25

# Metrics ranked, and how to read each out of an index row.
METRICS = ("growth", "headcount", "raised", "momentum")


def _metric_value(row: dict[str, Any], metric: str) -> float | None:
    if metric == "growth":
        windows = row.get("growth") or {}
        for key in ("d365", "d180", "d90"):
            if key in windows:
                return windows[key]["pct"]
        return None
    if metric == "headcount":
        return row.get("headcount")
    if metric == "raised":
        return row.get("totalRaised")
    if metric == "momentum":
        score = (row.get("momentum") or {}).get("score")
        return score if score else None
    return None


def _percentile(sorted_values: list[float], value: float) -> int:
    """Share of the cohort at or below ``value``, 0-100.

    Uses a simple "at or below" definition rather than an interpolated one:
    it is what a reader assumes "top 8%" means, and it survives ties sensibly.
    """
    if not sorted_values:
        return 0
    below = 0
    for v in sorted_values:
        if v <= value:
            below += 1
        else:
            break
    return round(below / len(sorted_values) * 100)


def _cohort_key(row: dict[str, Any], level: str) -> str | None:
    """Cohort definitions, narrowest first."""
    sector = row.get("sector")
    stage = row.get("fundingStage")
    if level == "sector_stage":
        return f"{sector} · {stage}" if sector and stage else None
    if level == "sector":
        return sector
    if level == "all":
        return "All tracked companies"
    return None


def annotate(rows: list[dict[str, Any]]) -> None:
    """Attach percentile context to each row, in place.

    Tries the narrowest cohort that clears ``MIN_COHORT``, so a company is
    compared to Fintech Series A companies where that group is large enough and
    to all of Fintech otherwise.
    """
    levels = ("sector_stage", "sector", "all")

    # Pre-index cohort members per level so this stays linear rather than
    # rescanning the whole table for every company.
    buckets: dict[str, dict[str, list[dict]]] = {level: {} for level in levels}
    for row in rows:
        for level in levels:
            key = _cohort_key(row, level)
            if key:
                buckets[level].setdefault(key, []).append(row)

    # Sorted metric values per cohort, computed once.
    sorted_cache: dict[tuple[str, str, str], list[float]] = {}

    def values_for(level: str, key: str, metric: str) -> list[float]:
        cache_key = (level, key, metric)
        if cache_key not in sorted_cache:
            vals = [
                v
                for member in buckets[level][key]
                if (v := _metric_value(member, metric)) is not None
            ]
            vals.sort()
            sorted_cache[cache_key] = vals
        return sorted_cache[cache_key]

    for row in rows:
        percentiles: dict[str, Any] = {}
        cohort_label: str | None = None
        cohort_size = 0

        for level in levels:
            key = _cohort_key(row, level)
            if not key:
                continue
            members = buckets[level][key]
            if len(members) < MIN_COHORT and level != "all":
                continue

            cohort_label = key
            cohort_size = len(members)

            for metric in METRICS:
                value = _metric_value(row, metric)
                if value is None:
                    continue
                cohort_values = values_for(level, key, metric)
                if len(cohort_values) < MIN_COHORT:
                    continue
                median = cohort_values[len(cohort_values) // 2]
                percentiles[metric] = {
                    "percentile": _percentile(cohort_values, value),
                    "value": round(value, 1) if isinstance(value, float) else value,
                    "median": round(median, 1) if isinstance(median, float) else median,
                    "n": len(cohort_values),
                }
            break

        if percentiles:
            row["peers"] = {
                "cohort": cohort_label,
                "cohortSize": cohort_size,
                "metrics": percentiles,
            }
