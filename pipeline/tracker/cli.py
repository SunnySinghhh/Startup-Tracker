"""Command-line entry point.

    tracker ingest    fetch sources -> data/          (the scheduled job)
    tracker build     data/ -> build/tracker.db       (derived, gitignored)
    tracker export    db -> web/public/data/*.json    (what the site reads)
    tracker all       ingest + build + export
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(name)-22s %(message)s",
        datefmt="%H:%M:%S",
    )
    # httpx/httpcore emit a full header dump per request at DEBUG, which buries
    # our own output. Verbose should mean "our logs", not "the whole transport".
    for noisy in ("httpx", "httpcore", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _report(title: str, stats: dict[str, object]) -> None:
    print(f"\n  {title}")
    for key, value in stats.items():
        print(f"    {key:.<32} {value}")


def cmd_ingest(args: argparse.Namespace) -> int:
    from . import ingest

    today = date.fromisoformat(args.date) if args.date else date.today()
    stats: dict[str, object] = {}

    if not args.only or "directory" in args.only:
        stats.update(ingest.ingest_directory(today))

    if not args.only or "press" in args.only:
        from .sources import press

        rows = press.fetch()
        matched = press.match_to_companies(rows)
        stats["press_items_fetched"] = len(rows)
        stats["press_signals_matched"] = ingest.record_signals(matched, today)

    if args.only and "edgar" in args.only or (not args.only and args.edgar):
        from .sources import edgar

        stats.update(edgar.run(today, limit=args.edgar_limit))

    if args.only and "github" in args.only or (not args.only and args.github):
        from .sources import github

        stats.update(github.run(today, limit=args.github_limit))

    _report("ingest complete", stats)
    return 0


def cmd_backfill_history(args: argparse.Namespace) -> int:
    from .sources import yc_history

    _report("history backfill complete", yc_history.run(limit=args.limit))
    return 0


def cmd_compact(args: argparse.Namespace) -> int:
    from . import paths, store

    before, after = store.compact(paths.SNAPSHOTS)
    _report(
        "compaction complete",
        {
            "rows_before": before,
            "rows_after": after,
            "removed": before - after,
            "kept_pct": f"{after / max(1, before) * 100:.1f}%",
        },
    )
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    from . import build

    _report("build complete", build.run())
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    from . import export

    _report("export complete", export.run())
    return 0


def cmd_all(args: argparse.Namespace) -> int:
    for fn in (cmd_ingest, cmd_build, cmd_export):
        rc = fn(args)
        if rc != 0:
            return rc
    return 0


def build_parser() -> argparse.ArgumentParser:
    # Shared flags live on a parent parser so `-v` works before *or* after the
    # subcommand — `tracker ingest -v` is the form everyone reaches for first.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-v", "--verbose", action="store_true")

    p = argparse.ArgumentParser(prog="tracker", description=__doc__ or "", parents=[common])
    sub = p.add_subparsers(dest="command", required=True)

    ing = sub.add_parser("ingest", help="fetch from sources into data/", parents=[common])
    ing.add_argument("--date", help="observation date (YYYY-MM-DD), defaults to today")
    ing.add_argument(
        "--only",
        nargs="+",
        choices=["directory", "press", "edgar", "github"],
        help="run only these sources",
    )
    ing.add_argument("--edgar", action="store_true", help="include SEC EDGAR enrichment")
    ing.add_argument("--edgar-limit", type=int, default=60, help="max companies to check")
    ing.add_argument("--github", action="store_true", help="include GitHub enrichment")
    ing.add_argument("--github-limit", type=int, default=60, help="max companies to check")
    ing.set_defaults(func=cmd_ingest)

    h = sub.add_parser(
        "backfill-history",
        help="recover ~2 years of headcount from the YC source's git history",
        parents=[common],
    )
    h.add_argument("--limit", type=int, help="only the N most recent weekly points")
    h.set_defaults(func=cmd_backfill_history)

    k = sub.add_parser(
        "compact",
        help="drop repeated snapshot rows, keeping only value changes",
        parents=[common],
    )
    k.set_defaults(func=cmd_compact)

    b = sub.add_parser("build", help="rebuild SQLite + momentum from data/", parents=[common])
    b.set_defaults(func=cmd_build)

    e = sub.add_parser("export", help="write JSON bundles the web app reads", parents=[common])
    e.set_defaults(func=cmd_export)

    a = sub.add_parser("all", help="ingest + build + export", parents=[common])
    a.add_argument("--date")
    a.add_argument("--only", nargs="+", choices=["directory", "press", "edgar", "github"])
    a.add_argument("--edgar", action="store_true")
    a.add_argument("--edgar-limit", type=int, default=60)
    a.add_argument("--github", action="store_true")
    a.add_argument("--github-limit", type=int, default=60)
    a.set_defaults(func=cmd_all)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _configure_logging(args.verbose)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
