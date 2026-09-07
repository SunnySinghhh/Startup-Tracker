"""Canonical filesystem layout.

Everything under ``data/`` is committed to git and is the source of truth.
Everything under ``build/`` is derived and gitignored — it can always be
regenerated from ``data/`` by running ``tracker build``.
"""

from __future__ import annotations

from pathlib import Path

# repo root: tracker/paths.py -> tracker -> pipeline -> root
ROOT = Path(__file__).resolve().parents[2]

DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
SIGNALS = DATA / "signals"
COMPANIES = DATA / "companies.json"
CUSTOM_COMPANIES = DATA / "custom-companies.json"
WATCHLIST = DATA / "watchlist.json"
FUNDING = DATA / "funding-rounds.jsonl"
EDGAR_OVERRIDES = DATA / "edgar-cik-overrides.json"

BUILD = ROOT / "build"
DB = BUILD / "tracker.db"
WEB_DATA = ROOT / "web" / "public" / "data"


def ensure_dirs() -> None:
    for d in (DATA, SNAPSHOTS, SIGNALS, BUILD, WEB_DATA):
        d.mkdir(parents=True, exist_ok=True)
