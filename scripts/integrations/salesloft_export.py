#!/usr/bin/env python3
"""
Salesloft Conversations/Transcriptions exporter

Features
- Exports all transcription artifacts to JSON files
- Optionally exports sentences to a CSV
- Computes counts for: total conversations, with recording, with transcript, and gap
- Paginates through conversations and transcriptions
- Retries with backoff on 429/5xx and honors Retry-After
- Supports incremental runs via --since for transcriptions

Env
- SALESLOFT_TOKEN: OAuth2 bearer token with Conversations/Transcriptions scopes

CLI
  python salesloft_export.py --out ./out [--since ISO8601] [--export-sentences]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
import random


BASE_URL = "https://api.salesloft.com/v2"
USER_AGENT = "salesloft-exporter/1.0"
DEFAULT_PER_PAGE = 100  # API enforces max 100
MAX_RETRIES = 6
INITIAL_BACKOFF = 2.0
MAX_WORKERS_RECORDINGS = 8
MAX_WORKERS_DOWNLOADS = 6
TIMEOUT = 30


def iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(s: str) -> str:
    # Validate and normalize to Z-suffixed ISO8601
    try:
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise argparse.ArgumentTypeError(f"Invalid ISO8601 datetime: {s}")
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def env_token() -> str:
    token = os.getenv("SALESLOFT_TOKEN")
    if not token:
        print("ERROR: SALESLOFT_TOKEN env var is not set", file=sys.stderr)
        sys.exit(2)
    return token


def backoff_sleep(retry: int, retry_after: Optional[str]) -> None:
    if retry_after:
        try:
            delay = float(retry_after)
        except ValueError:
            delay = min(60.0, INITIAL_BACKOFF * (2 ** retry))
    else:
        delay = min(60.0, INITIAL_BACKOFF * (2 ** retry))
    # add small jitter to avoid thundering herd
    delay = delay * (0.8 + 0.4 * random.random())
    time.sleep(delay)


_SESSION = requests.Session()


def api_request(
    method: str,
    path_or_url: str,
    token: str,
    params: Optional[Dict[str, Any]] = None,
    is_absolute: bool = False,
    stream: bool = False,
) -> requests.Response:
    url = path_or_url if is_absolute else f"{BASE_URL}{path_or_url}"
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = _SESSION.request(
                method,
                url,
                headers=headers,
                params=params,
                timeout=TIMEOUT,
                stream=stream,
            )
        except Exception as e:  # network errors
            last_err = e
            backoff_sleep(attempt, None)
            continue

        if resp.status_code == 429 or 500 <= resp.status_code < 600:
            retry_after = resp.headers.get("Retry-After")
            backoff_sleep(attempt + 1, retry_after)
            last_err = Exception(f"HTTP {resp.status_code} on {method} {url}")
            continue

        return resp

    if last_err:
        raise last_err
    raise RuntimeError("Unknown error in api_request")


def api_get_json(path: str, token: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    resp = api_request("GET", path, token, params=params)
    if resp.status_code == 404:
        return {"data": None}
    resp.raise_for_status()
    return resp.json()


def safe_to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    # Accept integer/float epoch seconds
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
            # maybe numeric string
            try:
                return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")
            except Exception:
                return None
    return None


def page_through(
    path: str,
    token: str,
    base_params: Optional[Dict[str, Any]] = None,
) -> Iterable[Dict[str, Any]]:
    params = dict(base_params or {})
    params.setdefault("per_page", DEFAULT_PER_PAGE)
    page = 1
    total_pages = None
    while True:
        params["page"] = page
        payload = api_get_json(path, token, params)
        items = payload.get("data") or []
        for item in items:
            yield item

        meta = payload.get("metadata", {})
        paging = meta.get("paging") if isinstance(meta, dict) else None
        if paging and isinstance(paging, dict):
            total_pages = paging.get("total_pages")
        if total_pages is not None and page >= int(total_pages):
            break
        if not items:
            break
        page += 1


@dataclass
class Conversation:
    id: str
    title: Optional[str]
    platform: Optional[str]
    media_type: Optional[str]
    started_recording_at: Optional[str]
    has_recording: bool = False


def fetch_conversations(token: str) -> List[Conversation]:
    convs: List[Conversation] = []
    count = 0
    for item in page_through("/conversations", token):
        convs.append(
            Conversation(
                id=str(item.get("id")),
                title=item.get("title"),
                platform=(item.get("platform") or {}).get("name") if isinstance(item.get("platform"), dict) else item.get("platform"),
                media_type=item.get("media_type"),
                started_recording_at=item.get("started_recording_at"),
            )
        )
        count += 1
        # Progress feedback is printed by caller based on total list length
    return convs


def check_recording_for_conversation(conv_id: str, token: str) -> bool:
    try:
        payload = api_get_json(f"/conversations/{conv_id}/recording", token)
        data = payload.get("data")
        if not data:
            return False
        url = data.get("url") if isinstance(data, dict) else None
        return bool(url)
    except requests.HTTPError as e:
        if getattr(e.response, "status_code", None) == 404:
            return False
        raise


def annotate_recordings(convs: List[Conversation], token: str, max_workers: int, progress_every: int) -> None:
    total = len(convs)
    done = 0
    if total == 0:
        return
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        fut_map = {ex.submit(check_recording_for_conversation, c.id, token): c for c in convs}
        for fut in as_completed(fut_map):
            c = fut_map[fut]
            try:
                c.has_recording = bool(fut.result())
            except Exception:
                c.has_recording = False
            done += 1
            if progress_every and done % progress_every == 0:
                print(f"Checked recordings: {done}/{total}")


@dataclass
class TranscriptionIndex:
    id: str
    conversation_id: Optional[str]


def fetch_transcriptions(token: str, since: Optional[str]) -> List[TranscriptionIndex]:
    params: Dict[str, Any] = {}
    if since:
        # Use updated_at[gte] to allow reprocessing/updates
        params["updated_at[gte]"] = since
    trans: List[TranscriptionIndex] = []
    for item in page_through("/transcriptions", token, params):
        tid = str(item.get("id"))
        conv = item.get("conversation") or {}
        cid = conv.get("id") if isinstance(conv, dict) else None
        trans.append(TranscriptionIndex(id=tid, conversation_id=(str(cid) if cid is not None else None)))
    return trans


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def download_artifact_json(tid: str, token: str, out_dir: Path) -> Tuple[str, bool, Optional[str]]:
    """Return (tid, saved, error)"""
    dest = out_dir / f"{tid}.json"
    if dest.exists():
        return tid, False, None
    try:
        payload = api_get_json(f"/transcriptions/{tid}/artifact", token)
        data = payload.get("data") or {}
        url = data.get("url")
        if not url:
            return tid, False, f"No artifact URL for transcription {tid}"
        # Signed URL download immediately
        resp = api_request("GET", url, token, is_absolute=True, stream=False)
        resp.raise_for_status()
        # Artifact is JSON text
        content = resp.text
        dest.write_text(content, encoding="utf-8")
        return tid, True, None
    except Exception as e:
        return tid, False, str(e)


def fetch_sentences_for_transcription(
    tid: str, token: str
) -> Iterable[Dict[str, Any]]:
    # Page just in case the endpoint is paginated
    for item in page_through(f"/transcriptions/{tid}/sentences", token):
        yield item


CONV_CACHE: Dict[str, Dict[str, Any]] = {}
MAX_CONV_CACHE = 20000


def fetch_conversation_details(conv_id: str, token: str) -> Dict[str, Any]:
    if conv_id in CONV_CACHE:
        return CONV_CACHE[conv_id]
    payload = api_get_json(f"/conversations/{conv_id}", token)
    data = payload.get("data") or {}
    if len(CONV_CACHE) < MAX_CONV_CACHE:
        CONV_CACHE[conv_id] = data
    return data


def build_attendee_map_from_sentences(tid: str, token: str, limit: int = 300) -> Dict[str, Dict[str, Any]]:
    mapping: Dict[str, Dict[str, Any]] = {}
    if limit is not None and limit <= 0:
        return mapping
    count = 0
    for s in fetch_sentences_for_transcription(tid, token):
        ra = s.get("recording_attendee")
        if isinstance(ra, dict):
            rid = str(ra.get("id")) if ra.get("id") is not None else None
            if rid and rid not in mapping:
                # capture whatever human-friendly fields are present
                fields = {k: v for k, v in ra.items() if k not in {"id"}}
                mapping[rid] = fields
        count += 1
        if limit and count >= limit:
            break
    return mapping


def enrich_artifact_file(
    tid: str,
    cid: Optional[str],
    token: str,
    dest: Path,
    include_attendees_from_sentences: bool,
    attendee_scan_limit: int,
) -> Optional[str]:
    try:
        if not dest.exists():
            return "missing"
        data = json.loads(dest.read_text(encoding="utf-8"))
        enrichment = data.get("export_enrichment") if isinstance(data, dict) else None
        need_enrich = True
        if isinstance(enrichment, dict) and enrichment.get("call_date"):
            need_enrich = False
        if not need_enrich:
            return None

        convo_details = fetch_conversation_details(cid, token) if cid else {}
        started = safe_to_iso(convo_details.get("started_recording_at")) or safe_to_iso(convo_details.get("created_at"))
        call_date = started.split("T")[0] if started else None
        conv_summary = {
            "conversation_id": cid,
            "title": convo_details.get("title"),
            "platform": convo_details.get("platform"),
            "media_type": convo_details.get("media_type"),
            "started_recording_at": started,
            "call_date": call_date,
        }

        attendees_map: Dict[str, Dict[str, Any]] = {}
        if include_attendees_from_sentences:
            attendees_map = build_attendee_map_from_sentences(tid, token, attendee_scan_limit)

        export_enrichment = {
            "generated_at": iso_now(),
            "conversation": conv_summary,
            "attendees": attendees_map,
        }

        if isinstance(data, dict):
            data["export_enrichment"] = export_enrichment
        else:
            data = {"artifact": data, "export_enrichment": export_enrichment}

        dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return None
    except Exception as e:
        return str(e)


def append_sentences_csv(
    tid: str,
    cid: Optional[str],
    token: str,
    csv_path: Path,
    skip_if_exists: bool,
) -> Tuple[str, int, Optional[str]]:
    """Return (tid, rows_written, error)"""
    if skip_if_exists:
        # crude safeguard against duplication: if this tid already exported as JSON, likely sentences exist
        pass
    try:
        file_exists = csv_path.exists()
        with csv_path.open("a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow([
                    "transcription_id",
                    "conversation_id",
                    "start_time",
                    "end_time",
                    "order_number",
                    "recording_attendee_id",
                    "text",
                ])
            rows = 0
            for s in fetch_sentences_for_transcription(tid, token):
                writer.writerow([
                    tid,
                    cid or "",
                    s.get("start_time"),
                    s.get("end_time"),
                    s.get("order_number"),
                    (s.get("recording_attendee") or {}).get("id") if isinstance(s.get("recording_attendee"), dict) else "",
                    (s.get("text") or "").replace("\r\n", "\n").replace("\r", "\n"),
                ])
                rows += 1
        return tid, rows, None
    except Exception as e:
        return tid, 0, str(e)


# Lookup exports: people, accounts, users
def fetch_people(token: str) -> Iterable[Dict[str, Any]]:
    for item in page_through("/people", token):
        yield {
            "id": item.get("id"),
            "email_address": item.get("email_address"),
            "first_name": item.get("first_name"),
            "last_name": item.get("last_name"),
            "account_id": item.get("account_id"),
            "updated_at": item.get("updated_at"),
        }


def fetch_accounts(token: str) -> Iterable[Dict[str, Any]]:
    # Primary endpoint name in v2 is usually /accounts
    try:
        for item in page_through("/accounts", token):
            yield {
                "id": item.get("id"),
                "name": item.get("name"),
                "domain": item.get("domain"),
                "updated_at": item.get("updated_at"),
            }
    except Exception:
        # Fallback alias some tenants may expose
        for item in page_through("/companies", token):
            yield {
                "id": item.get("id"),
                "name": item.get("name"),
                "domain": item.get("domain"),
                "updated_at": item.get("updated_at"),
            }


def fetch_users(token: str) -> Iterable[Dict[str, Any]]:
    for item in page_through("/users", token):
        yield {
            "id": item.get("id"),
            "guid": item.get("guid") or item.get("id"),
            "name": item.get("name") or item.get("display_name"),
            "email_address": item.get("email_address") or item.get("email"),
            "updated_at": item.get("updated_at"),
        }


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Export Salesloft conversations/transcriptions")
    p.add_argument("--since", type=parse_iso, help="ISO8601, sets updated_at[gte] for /transcriptions", default=None)
    p.add_argument("--export-sentences", action="store_true", help="Also export sentences to CSV")
    p.add_argument("--out", default="./out", help="Output directory (default: ./out)")
    p.add_argument("--recording-workers", type=int, default=MAX_WORKERS_RECORDINGS)
    p.add_argument("--download-workers", type=int, default=MAX_WORKERS_DOWNLOADS)
    p.add_argument("--max-conversations", type=int, default=None, help="Process at most N conversations (spot-check mode)")
    p.add_argument("--max-transcriptions", type=int, default=None, help="Process at most N transcriptions (spot-check mode)")
    p.add_argument("--progress-every", type=int, default=200, help="Print progress every N items (0 disables)")
    p.add_argument("--enrich", action="store_true", default=True, help="Enrich artifact JSONs with conversation metadata and attendee names")
    p.add_argument("--no-enrich", dest="enrich", action="store_false", help="Disable enrichment of artifact JSONs")
    p.add_argument("--attendee-scan-limit", type=int, default=300, help="Max sentences to scan for attendee names (enrichment)")
    p.add_argument("--export-lookups", action="store_true", help="Export lookup tables: people, accounts, users")
    p.add_argument("--enrich-from-lookups", action="store_true", help="Enrich existing JSONs from local lookup tables (no API calls)")
    p.add_argument("--lookups-dir", default="lookups", help="Subdirectory under --out for lookup JSONs")
    p.add_argument("--populate-attendees-only", action="store_true", help="Populate attendee emails from /sentences into existing JSONs (no artifacts/conv details)")
    args = p.parse_args(argv)

    token = env_token()
    out_dir = Path(args.out)
    transcripts_dir = out_dir / "transcripts"
    ensure_dir(transcripts_dir)
    lookups_dir = out_dir / str(args.lookups_dir)
    if args.export_lookups or args.enrich_from_lookups:
        ensure_dir(lookups_dir)

    notes: List[str] = []
    if args.since:
        notes.append(f"Transcriptions filtered with updated_at[gte]={args.since}")

    # Decide if we run the heavy API steps (conversations/transcriptions/artifacts)
    heavy_api = not (
        (args.enrich_from_lookups and not args.enrich and not args.export_sentences)
        or (args.export_lookups and not args.enrich and not args.enrich_from_lookups and not args.export_sentences)
        or args.populate_attendees_only
    )

    convs: List[Conversation] = []
    trans_idx: List[TranscriptionIndex] = []
    saved_files = 0
    errors: List[str] = []
    transcript_convo_ids = set()

    if heavy_api:
        # Conversations
        print("Listing conversations...")
        convs = fetch_conversations(token)
        if args.max_conversations is not None:
            convs = convs[: max(0, int(args.max_conversations))]
        if args.progress_every and len(convs) >= args.progress_every:
            print(f"Fetched {len(convs)} conversations total.")
        # Annotate recordings concurrently
        print("Checking recording availability...")
        annotate_recordings(convs, token, max_workers=int(args.recording_workers), progress_every=int(args.progress_every))

        # Transcriptions index
        print("Listing transcriptions...")
        trans_idx = fetch_transcriptions(token, args.since)
        if args.max_transcriptions is not None:
            trans_idx = trans_idx[: max(0, int(args.max_transcriptions))]
        if args.progress_every and len(trans_idx) >= args.progress_every:
            print(f"Indexed {len(trans_idx)} transcriptions total.")

        transcript_convo_ids = {t.conversation_id for t in trans_idx if t.conversation_id is not None}

        # Download artifacts concurrently
        print("Downloading transcription artifacts...")
        with ThreadPoolExecutor(max_workers=int(args.download_workers)) as ex:
            futures = [ex.submit(download_artifact_json, t.id, token, transcripts_dir) for t in trans_idx]
            completed = 0
            total = len(futures)
            for fut in as_completed(futures):
                tid, saved, err = fut.result()
                if saved:
                    saved_files += 1
                if err:
                    errors.append(f"artifact {tid}: {err}")
                completed += 1
                if args.progress_every and completed % args.progress_every == 0:
                    print(f"Artifacts: {completed}/{total} done (saved so far: {saved_files})")

    # Enrich artifacts (including existing files that were not re-downloaded)
    if args.enrich and heavy_api:
        print("Enriching artifact JSONs with conversation metadata and call date...")
        with ThreadPoolExecutor(max_workers=int(args.download_workers)) as ex:
            futures = []
            for t in trans_idx:
                dest = transcripts_dir / f"{t.id}.json"
                futures.append(
                    ex.submit(
                        enrich_artifact_file,
                        t.id,
                        t.conversation_id,
                        token,
                        dest,
                        True,  # include attendees mapping via sentences (limited)
                        int(args.attendee_scan_limit),
                    )
                )
            completed = 0
            total = len(futures)
            for fut in as_completed(futures):
                err = fut.result()
                if err:
                    if err != "missing":
                        errors.append(f"enrich: {err}")
                completed += 1
                if args.progress_every and completed % args.progress_every == 0:
                    print(f"Enriched {completed}/{total} artifacts...")

    # Optional sentences export
    sentences_rows = 0
    if args.export_sentences:
        csv_path = out_dir / "sentences.csv"
        print("Exporting sentences CSV...")
        with ThreadPoolExecutor(max_workers=int(args.download_workers)) as ex:
            futures = []
            for t in trans_idx:
                # If transcript JSON exists already, we still export sentences (idempotent via append); no easy dedupe.
                futures.append(ex.submit(append_sentences_csv, t.id, t.conversation_id, token, csv_path, False))
            completed = 0
            total = len(futures)
            for fut in as_completed(futures):
                tid, rows, err = fut.result()
                sentences_rows += rows
                if err:
                    errors.append(f"sentences {tid}: {err}")
                completed += 1
                if args.progress_every and completed % args.progress_every == 0:
                    print(f"Sentences: {completed}/{total} transcriptions processed (rows so far: {sentences_rows})")

    # Populate attendees only (no conversation details or artifact downloads)
    if args.populate_attendees_only:
        print("Listing transcriptions for attendee population...")
        trans_idx = fetch_transcriptions(token, args.since)
        if args.max_transcriptions is not None:
            trans_idx = trans_idx[: max(0, int(args.max_transcriptions))]
        print("Populating attendees from sentences (no artifacts/conv details)...")
        def write_attendees(t: TranscriptionIndex) -> Tuple[str, int, Optional[str]]:
            dest = (out_dir / "transcripts") / f"{t.id}.json"
            if not dest.exists():
                return t.id, 0, None
            try:
                mapping = build_attendee_map_from_sentences(t.id, token, int(args.attendee_scan_limit))
                if not mapping:
                    return t.id, 0, None
                doc = json.loads(dest.read_text(encoding="utf-8"))
                if isinstance(doc, dict):
                    ee = doc.get("export_enrichment")
                    if not isinstance(ee, dict):
                        ee = {}
                        doc["export_enrichment"] = ee
                    ee["attendees"] = mapping
                else:
                    doc = {"artifact": doc, "export_enrichment": {"attendees": mapping}}
                dest.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
                return t.id, len(mapping), None
            except Exception as e:
                return t.id, 0, str(e)
        updated = 0
        errors_local: List[str] = []
        with ThreadPoolExecutor(max_workers=int(args.download_workers)) as ex:
            futures = [ex.submit(write_attendees, t) for t in trans_idx]
            completed = 0
            total = len(futures)
            for fut in as_completed(futures):
                tid, count_added, err = fut.result()
                if count_added:
                    updated += 1
                if err:
                    errors_local.append(f"attendees {tid}: {err}")
                completed += 1
                if args.progress_every and completed % int(args.progress_every) == 0:
                    print(f"Attendees populated for {completed}/{total} transcripts (files updated: {updated})")
        if errors_local:
            errors.extend(errors_local)

    # Export lookup tables if requested
    lookups_dir = out_dir / str(args.lookups_dir)
    if args.export_lookups:
        ensure_dir(lookups_dir)
        print("Exporting lookup tables (people, accounts, users)...")
        people = list(fetch_people(token))
        accounts = list(fetch_accounts(token))
        users = list(fetch_users(token))
        (lookups_dir / "people.json").write_text(json.dumps(people, ensure_ascii=False, indent=2), encoding="utf-8")
        (lookups_dir / "accounts.json").write_text(json.dumps(accounts, ensure_ascii=False, indent=2), encoding="utf-8")
        (lookups_dir / "users.json").write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved lookups to {lookups_dir}")

    # Local-only enrichment from existing lookup tables
    if args.enrich_from_lookups:
        print("Local enrichment from lookups (no API calls)...")
        # Load lookup files
        def load_json_list(p: Path) -> List[Dict[str, Any]]:
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except FileNotFoundError:
                return []
        people = load_json_list(lookups_dir / "people.json")
        accounts = load_json_list(lookups_dir / "accounts.json")
        users = load_json_list(lookups_dir / "users.json")

        people_by_email: Dict[str, Dict[str, Any]] = {}
        for item in people:
            email = (item.get("email_address") or "").strip().lower()
            if email:
                people_by_email[email] = item
        accounts_by_id: Dict[str, Dict[str, Any]] = {str(a.get("id")): a for a in accounts}
        users_by_guid: Dict[str, Dict[str, Any]] = {}
        for u in users:
            guid = str(u.get("guid") or u.get("id") or "")
            if guid:
                users_by_guid[guid] = u

        files = list(sorted((out_dir / "transcripts").glob("*.json")))
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
            attendees_map = ee.get("attendees") if isinstance(ee.get("attendees"), dict) else {}
            if not attendees_map:
                skipped += 1
                continue
            matches: Dict[str, Any] = {}
            for att_id, fields in attendees_map.items():
                email = (fields.get("email") or "").strip().lower() if isinstance(fields, dict) else ""
                if not email:
                    continue
                person = people_by_email.get(email)
                account = accounts_by_id.get(str(person.get("account_id"))) if person else None
                if person:
                    matches[att_id] = {
                        "email": email,
                        "person_id": person.get("id"),
                        "person_name": f"{person.get('first_name','')} {person.get('last_name','')}".strip(),
                        "account_id": person.get("account_id"),
                        "account_name": account.get("name") if account else None,
                    }
                else:
                    matches[att_id] = {"email": email, "person_id": None, "person_name": None, "account_id": None, "account_name": None}

            if matches:
                ee["attendee_matches"] = matches
                conv = ee.get("conversation") if isinstance(ee.get("conversation"), dict) else {}
                owner_guid = conv.get("owner_id") or conv.get("user_guid")
                if owner_guid and str(owner_guid) in users_by_guid:
                    u = users_by_guid[str(owner_guid)]
                    conv["owner_name"] = u.get("name") or u.get("display_name")
                    conv["owner_email"] = u.get("email_address") or u.get("email")
                    ee["conversation"] = conv
                doc["export_enrichment"] = ee
                fp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
                updated += 1
            else:
                skipped += 1
            if args.progress_every and idx % int(args.progress_every) == 0:
                print(f"Local enrichment: {idx}/{len(files)} processed (updated {updated}, skipped {skipped})")
        print(f"Local enrichment complete: updated {updated}, skipped {skipped}.")

    total_conversations = len(convs)
    conversations_with_recording = sum(1 for c in convs if c.has_recording)
    conversations_with_transcript = len(transcript_convo_ids)
    recording_but_no_transcript = sum(1 for c in convs if c.has_recording and c.id not in transcript_convo_ids)

    if errors:
        notes.append(f"Warnings: {len(errors)} issues. See last message or logs.")

    # Write report.json
    report = {
        "generated_at": iso_now(),
        "total_conversations": total_conversations,
        "conversations_with_recording": conversations_with_recording,
        "conversations_with_transcript": conversations_with_transcript,
        "recording_but_no_transcript": recording_but_no_transcript,
        "notes": "; ".join(notes),
    }
    ensure_dir(out_dir)
    (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    # One-line summary
    print(
        f"Convos: {total_conversations} | Recs: {conversations_with_recording} | "
        f"Transcripts: {conversations_with_transcript} | Gaps: {recording_but_no_transcript} | "
        f"Saved: {saved_files} files"
        + (f" | Sentences rows: {sentences_rows}" if args.export_sentences else "")
    )

    # If there were errors, still exit 0 as requested, but echo a short note to stderr
    if errors:
        print("Some items failed: " + "; ".join(errors[:5]) + ("; ..." if len(errors) > 5 else ""), file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
