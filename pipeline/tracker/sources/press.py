"""Funding / startup press via RSS.

Two jobs: build an event log of announcements, and produce a press-mention
count per company that becomes a momentum input.

The hard part is *matching* a headline to a company. Naive substring matching
across a 6,200-company directory is a false-positive machine — YC alone has
companies called Bond, Grid, Pave, Aspect and Cover, all of which are ordinary
English words that appear in tech headlines constantly.

The matcher is therefore deliberately conservative:
  * company name must be >= 4 characters
  * name must not be a common English word (see ``_STOPWORDS``)
  * match is case-sensitive on word boundaries, so "Bond" matches but "bond"
    does not — press style capitalises company names
  * a title match scores higher than a body match, and we record which, so the
    UI can show *why* something matched rather than asserting it blindly

This trades recall for precision on purpose. A tracker that cries wolf is worse
than one that misses a mention.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import UTC, date, datetime
from typing import Any

import feedparser

from .. import http, paths, store

log = logging.getLogger(__name__)

FEEDS = [
    ("TechCrunch", "https://techcrunch.com/feed/"),
    ("TechCrunch Startups", "https://techcrunch.com/category/startups/feed/"),
    ("TechCrunch Venture", "https://techcrunch.com/category/venture/feed/"),
]

# Company names that are also ordinary words. Matching these on a headline
# produces noise, so they are only matched when the headline also carries
# funding vocabulary (see ``_FUNDING_RE``).
_STOPWORDS = {
    "able", "about", "above", "abstract", "access", "account", "acorn", "across", "action",
    "active", "actual", "adapt", "after", "again", "agent", "agile", "align", "alive", "allow",
    "alpha", "amber", "amount", "anchor", "angle", "another", "answer", "apex", "apple", "arbor",
    "arch", "area", "arrow", "aspect", "assembly", "atlas", "atom", "aura", "author", "avenue",
    "axis", "banner", "base", "basis", "batch", "beacon", "beam", "bench", "beta", "better",
    "beyond", "binary", "block", "bloom", "blue", "board", "bolt", "bond", "boost", "border",
    "boulder", "brand", "branch", "brave", "break", "bridge", "brief", "bright", "broad", "buffer",
    "build", "bundle", "cadence", "camp", "canopy", "canvas", "capital", "capsule", "carbon",
    "cargo", "case", "catalog", "cause", "cedar", "cell", "center", "chain", "chair", "chance",
    "change", "channel", "chapter", "charge", "chart", "check", "chief", "circle", "city", "civic",
    "clarity", "class", "clean", "clear", "click", "cliff", "climb", "close", "cloud", "clover",
    "cluster", "coast", "code", "collective", "color", "comet", "common", "compass", "complete",
    "concept", "concrete", "connect", "console", "context", "control", "core", "corner", "cover",
    "craft", "crane", "create", "credit", "crest", "cross", "crown", "crystal", "cube", "current",
    "cycle", "data", "dawn", "decent", "deck", "deep", "delta", "demand", "depot", "design",
    "detail", "digit", "direct", "domain", "double", "draft", "drive", "eagle", "early", "earth",
    "east", "easy", "echo", "edge", "effect", "element", "elevate", "ember", "empire", "enable",
    "energy", "engine", "enter", "entry", "equal", "equity", "essence", "even", "event", "every",
    "exact", "excel", "expert", "extra", "fabric", "factor", "fair", "faith", "false", "family",
    "fast", "favor", "feather", "field", "figure", "file", "final", "finch", "find", "fine",
    "finish", "first", "flash", "fleet", "flex", "flight", "float", "flock", "flow", "focus",
    "folio", "force", "forge", "form", "formal", "forte", "forward", "found", "frame", "free",
    "fresh", "front", "frontier", "fuel", "full", "function", "fund", "fusion", "future", "galaxy",
    "gather", "gauge", "gear", "general", "genesis", "gentle", "giant", "gift", "given", "glass",
    "glide", "global", "glow", "goal", "gold", "good", "grace", "grade", "grain", "grand",
    "granite", "graph", "grasp", "gravity", "great", "green", "grid", "ground", "group", "grove",
    "growth", "guard", "guide", "habit", "half", "handle", "harbor", "hard", "harvest", "haven",
    "head", "health", "heart", "helix", "help", "here", "high", "hollow", "home", "honest",
    "honey", "hope", "horizon", "host", "house", "human", "hunt", "ideal", "image", "impact",
    "import", "impulse", "index", "indigo", "inner", "input", "insight", "instant", "intact",
    "intel", "intent", "invert", "iris", "iron", "island", "issue", "ivory", "jade", "join",
    "journey", "juniper", "keen", "keep", "kernel", "keystone", "kind", "knot", "known", "label",
    "labor", "lace", "ladder", "lake", "lamp", "land", "large", "later", "latitude", "launch",
    "layer", "leaf", "leap", "learn", "ledger", "legacy", "legend", "lemon", "lens", "level",
    "liberty", "lift", "light", "limit", "line", "link", "lion", "list", "little", "live", "local",
    "lock", "logic", "loop", "lotus", "loud", "lucid", "lumen", "lunar", "machine", "made",
    "magnet", "main", "major", "make", "mango", "manor", "many", "maple", "marble", "march",
    "marine", "mark", "market", "mason", "mass", "master", "match", "matter", "meadow", "mean",
    "measure", "median", "medium", "meet", "member", "memory", "mercury", "merge", "merit",
    "metal", "meter", "method", "metric", "middle", "might", "mile", "mind", "mine", "minor",
    "mint", "mirror", "mission", "mobile", "modal", "mode", "model", "modern", "moment", "money",
    "monitor", "month", "moon", "moral", "more", "morning", "motion", "motive", "mount", "move",
    "much", "must", "mutual", "narrow", "nation", "native", "natural", "nature", "near", "neat",
    "need", "nest", "network", "never", "next", "night", "nimble", "noble", "node", "noise",
    "north", "note", "notion", "novel", "number", "oasis", "object", "ocean", "offer", "office",
    "often", "olive", "omega", "onward", "opal", "open", "option", "orbit", "orchard", "order",
    "origin", "other", "ounce", "outer", "output", "oval", "over", "pace", "pact", "page", "paint",
    "pair", "palm", "panel", "paper", "parallel", "parcel", "park", "part", "partner", "party",
    "pass", "past", "patch", "path", "patient", "pattern", "pause", "pave", "peak", "pearl",
    "pebble", "peer", "pending", "people", "perch", "perfect", "period", "person", "phase",
    "phrase", "pick", "piece", "pillar", "pilot", "pine", "pioneer", "pitch", "pivot", "place",
    "plain", "plan", "plane", "planet", "plant", "plate", "play", "please", "pledge", "plenty",
    "plot", "plus", "pocket", "point", "polar", "policy", "poll", "pond", "pool", "port",
    "portal", "position", "positive", "post", "power", "praise", "precise", "prefer", "premium",
    "present", "press", "price", "pride", "prime", "print", "prism", "private", "prize", "probe",
    "process", "produce", "profile", "profit", "program", "project", "promise", "prompt", "proof",
    "proper", "propel", "prospect", "protect", "proud", "prove", "public", "pulse", "pure",
    "purpose", "push", "quality", "quantum", "quarry", "quarter", "quest", "quick", "quiet",
    "quill", "quota", "radar", "radial", "radius", "rail", "rain", "raise", "rally", "ramp",
    "random", "range", "rapid", "rate", "ratio", "reach", "react", "read", "ready", "real",
    "realm", "reason", "rebel", "recall", "recent", "record", "recover", "reef", "refine",
    "reflect", "region", "relay", "release", "relic", "remote", "render", "renew", "repeat",
    "reply", "report", "request", "rescue", "research", "reserve", "reset", "resolve", "resource",
    "respect", "response", "rest", "result", "return", "reveal", "review", "revise", "reward",
    "rhythm", "ribbon", "rich", "ridge", "right", "ring", "rise", "risk", "river", "road", "robin",
    "robust", "rock", "rocket", "root", "rose", "roster", "round", "route", "royal", "rule",
    "runner", "rural", "rush", "sable", "safe", "sage", "sail", "saint", "salt", "same", "sample",
    "sand", "satellite", "save", "scale", "scan", "scene", "scope", "score", "scout",
    "screen", "scribe", "script", "seal", "search", "season", "seat", "second", "secret",
    "section", "sector", "secure", "seed", "seek", "segment", "select", "sense", "sequence",
    "serial", "series", "serve", "service", "session", "settle", "seven", "shade", "shadow",
    "shape", "share", "sharp", "shed", "sheet", "shelf", "shell", "shield", "shift", "shine",
    "ship", "shore", "short", "show", "side", "sight", "sigma", "signal", "silver", "simple",
    "since", "single", "site", "sketch", "skill", "sky", "slate", "sleep", "slice", "slide",
    "slope", "small", "smart", "smooth", "snap", "social", "socket", "solar", "solid", "solo",
    "solve", "some", "sonar", "song", "sonic", "soon", "sound", "source", "south", "space",
    "span", "spare", "spark", "speak", "special", "spectrum", "speed", "spell", "sphere", "spin",
    "spirit", "split", "spoke", "spot", "spring", "sprint", "spruce", "square", "stable", "stack",
    "staff", "stage", "stake", "stamp", "stand", "star", "start", "state", "static", "station",
    "status", "stay", "steady", "steam", "steel", "stellar", "step", "stern", "still", "stock",
    "stone", "stop", "store", "storm", "story", "straight", "strand", "strata", "stream",
    "street", "strength", "stretch", "strike", "string", "strong", "studio", "study", "style",
    "subject", "sublime", "submit", "subtle", "success", "such", "sugar", "suite", "summit",
    "sunny", "super", "supply", "support", "sure", "surface", "surge", "survey", "sustain",
    "swan", "sweep", "sweet", "swift", "switch", "symbol", "system", "table", "tack", "tactic",
    "take", "tale", "talent", "talk", "tally", "tandem", "tangent", "target", "task", "taste",
    "teach", "team", "tech", "tell", "temple", "tempo", "tender", "tenet", "tenor", "tense",
    "tenth", "term", "terra", "test", "text", "texture", "than", "that", "thaw", "theme", "then",
    "theory", "there", "these", "thick", "thin", "thing", "think", "third", "this", "thorn",
    "those", "though", "thread", "three", "thrive", "through", "throw", "thumb", "thunder",
    "tick", "tide", "tier", "tiger", "tight", "tile", "timber", "time", "tiny", "title", "today",
    "token", "tone", "tool", "topic", "torch", "total", "touch", "tower", "town", "trace",
    "track", "trade", "trail", "train", "trait", "transit", "travel", "tread", "treat", "tree",
    "trend", "trial", "tribe", "trick", "trident", "trigger", "trim", "trinity", "trio", "triple",
    "true", "trust", "truth", "tulip", "tunnel", "turbo", "turn", "twin", "twist", "type",
    "ultra", "umber", "under", "unify", "union", "unique", "unit", "unity", "universe", "unlock",
    "until", "upper", "urban", "urge", "usage", "user", "usual", "utility", "valid", "valley",
    "value", "valve", "vanguard", "vantage", "vapor", "variable", "vault", "vector", "velvet",
    "vendor", "venture", "venue", "verify", "verse", "version", "vertex", "very", "vessel",
    "vibe", "victor", "video", "view", "vigor", "villa", "vine", "vintage", "violet", "virtue",
    "vision", "vista", "vital", "vivid", "vocal", "voice", "volt", "volume", "vote", "voyage",
    "wage", "wagon", "walk", "wall", "wander", "want", "warm", "warn", "watch", "water", "wave",
    "welcome", "weekly", "worthy", "wealth", "weight", "widget", "wisdom",
    "weave", "well", "west", "what", "wheat", "wheel", "when", "where", "which", "while", "whisper",
    "white", "whole", "wide", "will", "willow", "wind", "window", "wing", "winter", "wire", "wise",
    "wish", "with", "within", "wonder", "wood", "word", "work", "world", "worth",
    "would", "yard", "year", "yield", "young", "your", "zenith", "zero", "zone",
}

_FUNDING_RE = re.compile(
    r"\b(raise[sd]?|raising|funding|round|seed|series\s+[A-E]|valuation|led\s+by|"
    r"backed\s+by|investors?|venture|million|billion|acqui(?:re[sd]?|sition))\b",
    re.IGNORECASE,
)

# "Cherry" the YC company vs. "Cherry Ventures" the VC firm. Press writes about
# investors constantly, and their names collide with portfolio company names.
# If the matched name is immediately followed by one of these, it's a firm.
_INVESTOR_SUFFIX_RE = re.compile(
    r"\s+(Ventures?|Capital|Partners|Fund|Funds|VC|Equity|Holdings|Group|Labs)\b"
)

# Entities that are ecosystem infrastructure, not trackable startups.
_ENTITY_BLOCKLIST = {"y combinator", "techstars", "500 startups", "techcrunch"}

# How far from the company name funding vocabulary must appear for an
# ambiguous (dictionary-word) name to count as a real mention.
_PROXIMITY_CHARS = 80


def _near_funding_language(text: str, start: int, end: int) -> bool:
    """Is there funding vocabulary within a short window of the match?

    Checking the whole document is far too loose — an article about Swedish
    startups mentions "venture" somewhere, which was enough to wrongly promote
    "The Builders Stage" into a funding signal for a company named Stage.
    """
    window = text[max(0, start - _PROXIMITY_CHARS) : end + _PROXIMITY_CHARS]
    return bool(_FUNDING_RE.search(window))


_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return _TAG_RE.sub(" ", text or "").replace("&#8217;", "'").replace("&amp;", "&").strip()


def fetch(feeds: list[tuple[str, str]] | None = None) -> list[dict[str, Any]]:
    """Pull all feeds. A single failing feed is logged, not fatal."""
    feeds = feeds or FEEDS
    items: list[dict[str, Any]] = []
    seen_links: set[str] = set()

    with http.client() as c:
        for name, url in feeds:
            resp = http.get_with_retry(c, url)
            if resp is None or resp.status_code != 200:
                log.warning("feed unavailable, skipping: %s (%s)", name, url)
                continue

            parsed = feedparser.parse(resp.content)
            for entry in parsed.entries:
                link = entry.get("link")
                if not link or link in seen_links:
                    continue
                seen_links.add(link)

                published = entry.get("published_parsed") or entry.get("updated_parsed")
                if published:
                    published_at = datetime(*published[:6], tzinfo=UTC).date().isoformat()
                else:
                    published_at = date.today().isoformat()

                items.append(
                    {
                        "title": _clean(entry.get("title", "")),
                        "summary": _clean(entry.get("summary", ""))[:1000],
                        "link": link,
                        "published": published_at,
                        "feed": name,
                    }
                )
            log.info("fetched %-24s %3d entries", name, len(parsed.entries))

    return items


def _candidates() -> list[tuple[str, str, re.Pattern[str], bool]]:
    """Build (company_id, name, pattern, is_ambiguous) for matchable companies."""
    companies = store.read_json(paths.COMPANIES, default=[])
    out = []
    for c in companies:
        name = (c.get("name") or "").strip()
        if len(name) < 4 or name.lower() in _ENTITY_BLOCKLIST:
            continue
        ambiguous = name.lower() in _STOPWORDS or (
            " " not in name and name.lower() in _STOPWORDS
        )
        out.append((c["id"], name, re.compile(rf"\b{re.escape(name)}\b"), ambiguous))
    return out


def match_to_companies(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn press items into company signals.

    Precision is worth far more than recall here. A tracker that reports a
    funding round that didn't happen is actively misleading; one that misses a
    mention is merely incomplete. Every rule below trades recall for precision.
    """
    candidates = _candidates()
    if not candidates:
        log.warning("no companies in directory yet — run the directory ingest first")
        return []

    signals: list[dict[str, Any]] = []
    rejected = 0

    for item in items:
        title = item["title"]
        body = f"{title}. {item['summary']}"

        for company_id, _name, pattern, ambiguous in candidates:
            # Check *every* occurrence: a name can appear once as the investor
            # ("Cherry Ventures") and once bare, and only the bare one counts.
            raw_hits = list(pattern.finditer(body))
            if not raw_hits:
                continue
            occurrences = [m for m in raw_hits if not _INVESTOR_SUFFIX_RE.match(body, m.end())]
            if not occurrences:
                rejected += 1
                continue

            title_hits = [
                m for m in pattern.finditer(title)
                if not _INVESTOR_SUFFIX_RE.match(title, m.end())
            ]
            in_title = bool(title_hits)
            near_funding = any(
                _near_funding_language(body, m.start(), m.end()) for m in occurrences
            )

            if ambiguous:
                # Dictionary-word names must clear a much higher bar: named in
                # the headline AND sitting next to funding vocabulary.
                if not (in_title and near_funding):
                    rejected += 1
                    continue
                confidence = "low"
            else:
                confidence = "high" if in_title else "medium"

            signal_type = "funding" if near_funding else "press"

            digest = hashlib.sha1(f"{company_id}|{item['link']}".encode()).hexdigest()[:16]
            signals.append(
                {
                    "id": f"press:{digest}",
                    "company_id": company_id,
                    "signal_type": signal_type,
                    "signal_date": item["published"],
                    "title": title,
                    "description": item["summary"][:400] or None,
                    "source_url": item["link"],
                    "source_type": "rss",
                    "confidence": confidence,
                    "matched_in": "title" if in_title else "body",
                }
            )

    log.info(
        "matched %d press signals from %d items (%d candidate matches rejected)",
        len(signals), len(items), rejected,
    )
    return signals
