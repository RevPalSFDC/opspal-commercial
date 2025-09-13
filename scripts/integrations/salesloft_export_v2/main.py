from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .db import connect, init_db
from .api import SalesloftClient
from .steps import (
    Ctx,
    index_transcriptions,
    download_artifacts,
    enrich_convmeta,
    capture_attendees,
    export_lookups,
    enrich_local,
    generate_report,
    export_links_csv,
)


def env_token() -> str:
    tok = os.getenv("SALESLOFT_TOKEN")
    if not tok:
        raise SystemExit("SALESLOFT_TOKEN not set")
    return tok


def build_ctx(out_dir: Path, rps: float) -> Ctx:
    db_path = out_dir / "manifest" / "salesloft.sqlite"
    conn = connect(db_path)
    init_db(conn)
    client = SalesloftClient(env_token(), rps=rps)
    transcripts_dir = out_dir / "transcripts"
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    return Ctx(out_dir=out_dir, transcripts_dir=transcripts_dir, db=conn, client=client)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="salesloft-v2", description="Salesloft exporter v2 (SQLite manifest)")
    p.add_argument("--out", default="./out", help="Output directory (default ./out)")
    p.add_argument("--rps", type=float, default=5.0, help="Max requests per second (default 5)")

    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("index", help="Index transcriptions into manifest")
    sp.add_argument("--since", default=None, help="updated_at[gte] for /transcriptions")
    sp.add_argument("--max", type=int, default=None, help="Max rows to index")

    sp = sub.add_parser("artifacts", help="Download transcription artifacts")
    sp.add_argument("--limit", type=int, default=None)

    sp = sub.add_parser("convmeta", help="Enrich conversation metadata + call_date")
    sp.add_argument("--limit", type=int, default=None)

    sp = sub.add_parser("capture-attendees", help="Populate attendee emails from sentences")
    sp.add_argument("--limit", type=int, default=None)
    sp.add_argument("--sentences", type=int, default=25, help="Max sentences per transcription")

    sub.add_parser("export-lookups", help="Export People/Accounts/Users into manifest")

    sp = sub.add_parser("enrich-local", help="Local match attendees -> People/Accounts using manifest")
    sp.add_argument("--progress-every", type=int, default=1000)

    sub.add_parser("report", help="Print summary counts as JSON")

    sp = sub.add_parser("export-links", help="Export conversation→person→account links CSV")
    sp.add_argument("--csv", default=None, help="Output CSV path (default out/links.csv)")

    sp = sub.add_parser("all", help="Run index -> artifacts -> convmeta -> capture-attendees pipeline")
    sp.add_argument("--since", default=None)

    args = p.parse_args(argv)
    out_dir = Path(args.out)
    ctx = build_ctx(out_dir, rps=float(args.rps))

    if args.cmd == "index":
        n = index_transcriptions(ctx, since=args.since, max_rows=args.max)
        print(f"Indexed {n} transcriptions")
    elif args.cmd == "artifacts":
        done, err = download_artifacts(ctx, limit=args.limit)
        print(f"Artifacts downloaded: {done}, errors: {err}")
    elif args.cmd == "convmeta":
        up, err = enrich_convmeta(ctx, limit=args.limit)
        print(f"Convmeta updated: {up}, errors: {err}")
    elif args.cmd == "capture-attendees":
        up, err = capture_attendees(ctx, sentence_limit=args.sentences, limit=args.limit)
        print(f"Attendees populated: {up}, errors: {err}")
    elif args.cmd == "export-lookups":
        ppl, acc, usr = export_lookups(ctx)
        print(f"Lookups -> people:{ppl} accounts:{acc} users:{usr}")
    elif args.cmd == "enrich-local":
        up, skip = enrich_local(ctx, progress_every=args.progress_every)
        print(f"Local enrichment: updated {up}, skipped {skip}")
    elif args.cmd == "report":
        rep = generate_report(ctx)
        print(json.dumps(rep, indent=2))
    elif args.cmd == "export-links":
        csv_path = Path(args.csv) if args.csv else (ctx.out_dir / "links.csv")
        n = export_links_csv(ctx, csv_path)
        print(f"Exported {n} link rows to {csv_path}")
    elif args.cmd == "all":
        n = index_transcriptions(ctx, since=args.since)
        print(f"Indexed {n}")
        d,e = download_artifacts(ctx)
        print(f"Artifacts {d} ok, {e} errors")
        u,e2 = enrich_convmeta(ctx)
        print(f"Convmeta {u} ok, {e2} errors")
        a,e3 = capture_attendees(ctx)
        print(f"Attendees {a} ok, {e3} errors")
        rep = generate_report(ctx)
        print(json.dumps(rep, indent=2))
    else:
        p.error("unknown command")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
