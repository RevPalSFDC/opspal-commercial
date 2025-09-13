from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .api import SalesloftClient


@dataclass
class Ctx:
    out_dir: Path
    transcripts_dir: Path
    db: sqlite3.Connection
    client: SalesloftClient


def index_transcriptions(ctx: Ctx, since: Optional[str] = None, max_rows: Optional[int] = None) -> int:
    params = {}
    if since:
        params["updated_at[gte]"] = since
    count = 0
    for item in ctx.client.page("/transcriptions", params=params):
        tid = str(item.get("id"))
        conv = item.get("conversation") or {}
        cid = conv.get("id") if isinstance(conv, dict) else None
        updated_at = item.get("updated_at")
        ctx.db.execute(
            """
            INSERT INTO transcriptions(id, conversation_id, updated_at, artifact_status, convmeta_status, attendees_status)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id, updated_at=excluded.updated_at
            """,
            (tid, str(cid) if cid else None, updated_at, "pending", "pending", "pending"),
        )
        count += 1
        if max_rows and count >= max_rows:
            break
    ctx.db.commit()
    return count


def download_artifacts(ctx: Ctx, limit: Optional[int] = None) -> Tuple[int, int]:
    cur = ctx.db.execute(
        "SELECT id FROM transcriptions WHERE artifact_status!='done' OR artifact_status IS NULL"
    )
    rows = cur.fetchall()
    done = 0
    errors = 0
    for (tid,) in rows:
        tid = str(tid)
        dest = ctx.transcripts_dir / f"{tid}.json"
        if dest.exists():
            ctx.db.execute("UPDATE transcriptions SET artifact_path=?, artifact_status='done' WHERE id=?", (str(dest), tid))
            done += 1
        else:
            try:
                payload = ctx.client.get_json(f"/transcriptions/{tid}/artifact")
                url = (payload.get("data") or {}).get("url")
                if not url:
                    ctx.db.execute("UPDATE transcriptions SET artifact_status='missing' WHERE id=?", (tid,))
                    errors += 1
                    continue
                resp = ctx.client.request("GET", url, absolute=True)
                resp.raise_for_status()
                dest.write_text(resp.text, encoding="utf-8")
                ctx.db.execute("UPDATE transcriptions SET artifact_path=?, artifact_status='done' WHERE id=?", (str(dest), tid))
                done += 1
            except Exception as e:
                ctx.db.execute("UPDATE transcriptions SET last_error=?, artifact_status='error' WHERE id=?", (str(e), tid))
                errors += 1
        if limit and (done + errors) >= limit:
            break
    ctx.db.commit()
    return done, errors


def enrich_convmeta(ctx: Ctx, limit: Optional[int] = None) -> Tuple[int, int]:
    cur = ctx.db.execute(
        "SELECT id, conversation_id FROM transcriptions WHERE convmeta_status!='done' OR convmeta_status IS NULL"
    )
    rows = cur.fetchall()
    updated = 0
    errors = 0
    for rid in rows:
        tid, cid = rid[0], rid[1]
        dest = ctx.transcripts_dir / f"{tid}.json"
        if not dest.exists():
            continue
        try:
            convo = {}
            if cid:
                payload = ctx.client.get_json(f"/conversations/{cid}")
                convo = payload.get("data") or {}
            started = _safe_to_iso(convo.get("started_recording_at")) or _safe_to_iso(convo.get("created_at"))
            call_date = started.split("T")[0] if started else None
            conv_summary = {
                "conversation_id": str(cid) if cid else None,
                "title": convo.get("title"),
                "platform": convo.get("platform"),
                "media_type": convo.get("media_type"),
                "started_recording_at": started,
                "call_date": call_date,
            }
            doc = json.loads(dest.read_text(encoding="utf-8"))
            if isinstance(doc, dict):
                ee = doc.get("export_enrichment")
                if not isinstance(ee, dict):
                    ee = {}
                    doc["export_enrichment"] = ee
                ee["conversation"] = conv_summary
            else:
                doc = {"artifact": doc, "export_enrichment": {"conversation": conv_summary}}
            dest.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            ctx.db.execute("UPDATE transcriptions SET convmeta_status='done' WHERE id=?", (tid,))
            updated += 1
        except Exception as e:
            ctx.db.execute("UPDATE transcriptions SET last_error=?, convmeta_status='error' WHERE id=?", (str(e), tid))
            errors += 1
        if limit and (updated + errors) >= limit:
            break
    ctx.db.commit()
    return updated, errors


def capture_attendees(ctx: Ctx, sentence_limit: int = 25, limit: Optional[int] = None) -> Tuple[int, int]:
    cur = ctx.db.execute(
        "SELECT id FROM transcriptions WHERE attendees_status!='done' OR attendees_status IS NULL"
    )
    rows = cur.fetchall()
    updated = 0
    errors = 0
    for (tid,) in rows:
        tid = str(tid)
        dest = ctx.transcripts_dir / f"{tid}.json"
        if not dest.exists():
            continue
        try:
            attendees: Dict[str, Dict] = {}
            count = 0
            for s in ctx.client.page(f"/transcriptions/{tid}/sentences"):
                ra = s.get("recording_attendee") or {}
                if isinstance(ra, dict):
                    rid = str(ra.get("id")) if ra.get("id") is not None else None
                    if rid and rid not in attendees:
                        fields = {k: v for k, v in ra.items() if k != "id"}
                        attendees[rid] = fields
                count += 1
                if sentence_limit and count >= sentence_limit:
                    break
            if attendees:
                doc = json.loads(dest.read_text(encoding="utf-8"))
                if isinstance(doc, dict):
                    ee = doc.get("export_enrichment")
                    if not isinstance(ee, dict):
                        ee = {}
                        doc["export_enrichment"] = ee
                    ee["attendees"] = attendees
                else:
                    doc = {"artifact": doc, "export_enrichment": {"attendees": attendees}}
                dest.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            ctx.db.execute("UPDATE transcriptions SET attendees_status='done' WHERE id=?", (tid,))
            updated += 1
        except Exception as e:
            ctx.db.execute("UPDATE transcriptions SET last_error=?, attendees_status='error' WHERE id=?", (str(e), tid))
            errors += 1
        if limit and (updated + errors) >= limit:
            break
    ctx.db.commit()
    return updated, errors


def export_lookups(ctx: Ctx) -> Tuple[int, int, int]:
    ppl = 0
    for item in ctx.client.page("/people"):
        ctx.db.execute(
            "INSERT OR REPLACE INTO people(id,email_address,first_name,last_name,account_id,updated_at) VALUES(?,?,?,?,?,?)",
            (item.get("id"), item.get("email_address"), item.get("first_name"), item.get("last_name"), item.get("account_id"), item.get("updated_at")),
        )
        ppl += 1
    ctx.db.commit()
    acc = 0
    try:
        path = "/accounts"
        for item in ctx.client.page(path):
            ctx.db.execute(
                "INSERT OR REPLACE INTO accounts(id,name,domain,updated_at) VALUES(?,?,?,?)",
                (item.get("id"), item.get("name"), item.get("domain"), item.get("updated_at")),
            )
            acc += 1
    except Exception:
        for item in ctx.client.page("/companies"):
            ctx.db.execute(
                "INSERT OR REPLACE INTO accounts(id,name,domain,updated_at) VALUES(?,?,?,?)",
                (item.get("id"), item.get("name"), item.get("domain"), item.get("updated_at")),
            )
            acc += 1
    ctx.db.commit()
    usr = 0
    for item in ctx.client.page("/users"):
        guid = item.get("guid") or item.get("id")
        ctx.db.execute(
            "INSERT OR REPLACE INTO users(id,guid,name,email_address,updated_at) VALUES(?,?,?,?,?)",
            (item.get("id"), guid, item.get("name") or item.get("display_name"), item.get("email_address") or item.get("email"), item.get("updated_at")),
        )
        usr += 1
    ctx.db.commit()
    return ppl, acc, usr


def enrich_local(ctx: Ctx, progress_every: int = 1000) -> Tuple[int, int]:
    # Build maps
    people_by_email = {row[0].lower(): (row[1], row[2], row[3]) for row in ctx.db.execute("SELECT email_address,id,first_name,last_name FROM people WHERE email_address IS NOT NULL")}
    accounts_by_id = {str(row[0]): row[1] for row in ctx.db.execute("SELECT id,name FROM accounts")}
    users_by_guid = {str(row[0]): (row[1], row[2]) for row in ctx.db.execute("SELECT guid,name,email_address FROM users WHERE guid IS NOT NULL")}

    files = sorted(ctx.transcripts_dir.glob("*.json"))
    updated = 0
    skipped = 0
    for idx, fp in enumerate(files, 1):
        try:
            doc = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            skipped += 1
            continue
        ee = doc.get("export_enrichment") if isinstance(doc, dict) else None
        if not isinstance(ee, dict):
            skipped += 1
            continue
        attendees = ee.get("attendees") if isinstance(ee.get("attendees"), dict) else {}
        if not attendees:
            skipped += 1
            continue
        matches: Dict[str, Dict] = {}
        for att_id, fields in attendees.items():
            email = (fields.get("email") or "").strip().lower() if isinstance(fields, dict) else ""
            if not email:
                continue
            person_info = people_by_email.get(email)
            if person_info:
                person_id, first, last = person_info
                # Fetch account from people row
                acc_row = ctx.db.execute("SELECT account_id FROM people WHERE id=?", (person_id,)).fetchone()
                account_id = acc_row[0] if acc_row else None
                account_name = accounts_by_id.get(str(account_id)) if account_id else None
                matches[att_id] = {
                    "email": email,
                    "person_id": person_id,
                    "person_name": f"{first or ''} {last or ''}".strip() or None,
                    "account_id": account_id,
                    "account_name": account_name,
                }
            else:
                matches[att_id] = {"email": email, "person_id": None, "person_name": None, "account_id": None, "account_name": None}
        if matches:
            ee["attendee_matches"] = matches
            conv = ee.get("conversation") if isinstance(ee.get("conversation"), dict) else {}
            owner_guid = conv.get("owner_id") or conv.get("user_guid")
            if owner_guid and str(owner_guid) in users_by_guid:
                name, email = users_by_guid[str(owner_guid)]
                conv["owner_name"] = name
                conv["owner_email"] = email
                ee["conversation"] = conv
            doc["export_enrichment"] = ee
            fp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            updated += 1
        else:
            skipped += 1
        if progress_every and idx % progress_every == 0:
            print(f"Local enrichment: {idx}/{len(files)} processed (updated {updated}, skipped {skipped})")
    return updated, skipped


def generate_report(ctx: Ctx) -> Dict[str, int]:
    tot = ctx.db.execute("SELECT COUNT(1) FROM transcriptions").fetchone()[0]
    art = ctx.db.execute("SELECT COUNT(1) FROM transcriptions WHERE artifact_status='done'").fetchone()[0]
    meta = ctx.db.execute("SELECT COUNT(1) FROM transcriptions WHERE convmeta_status='done'").fetchone()[0]
    att = ctx.db.execute("SELECT COUNT(1) FROM transcriptions WHERE attendees_status='done'").fetchone()[0]
    return {"transcriptions_indexed": tot, "artifacts_downloaded": art, "convmeta_enriched": meta, "attendees_populated": att}


def _safe_to_iso(value) -> Optional[str]:
    import datetime as dt
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")
        except Exception:
            return None
    if isinstance(value, str):
        try:
            d = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=dt.timezone.utc)
            return d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
        except Exception:
            try:
                return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")
            except Exception:
                return None
    return None


def export_links_csv(ctx: Ctx, csv_path: Path) -> int:
    import csv
    count = 0
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "transcription_id",
            "conversation_id",
            "call_date",
            "title",
            "attendee_email",
            "person_id",
            "person_name",
            "account_id",
            "account_name",
            "owner_name",
            "owner_email",
        ])
        for fp in sorted(ctx.transcripts_dir.glob("*.json")):
            try:
                tid = fp.stem
                doc = json.loads(fp.read_text(encoding="utf-8"))
                ee = doc.get("export_enrichment") if isinstance(doc, dict) else None
                if not isinstance(ee, dict):
                    continue
                conv = ee.get("conversation") if isinstance(ee.get("conversation"), dict) else {}
                attendees = ee.get("attendees") if isinstance(ee.get("attendees"), dict) else {}
                matches = ee.get("attendee_matches") if isinstance(ee.get("attendee_matches"), dict) else {}
                for att_id, fields in attendees.items():
                    email = (fields.get("email") or "") if isinstance(fields, dict) else ""
                    m = matches.get(att_id) if isinstance(matches, dict) else None
                    w.writerow([
                        tid,
                        conv.get("conversation_id"),
                        conv.get("call_date"),
                        conv.get("title"),
                        email,
                        m.get("person_id") if isinstance(m, dict) else None,
                        m.get("person_name") if isinstance(m, dict) else None,
                        m.get("account_id") if isinstance(m, dict) else None,
                        m.get("account_name") if isinstance(m, dict) else None,
                        conv.get("owner_name"),
                        conv.get("owner_email"),
                    ])
                    count += 1
            except Exception:
                continue
    return count
