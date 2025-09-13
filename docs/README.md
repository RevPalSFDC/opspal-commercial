## Salesloft Conversations / Transcriptions Exporter

Exports conversation transcription artifacts to disk and reports counts. Optionally exports sentence-level CSV.

### Features

- Exports all transcription artifacts as individual JSON files (`out/transcripts/{id}.json`).
- Enriches saved JSONs with conversation metadata (title, platform, media_type, started_recording_at, call_date) and an attendee map (from sentences), under `export_enrichment`.
- Optional `sentences.csv` containing: `transcription_id, conversation_id, start_time, end_time, order_number, recording_attendee_id, text`.
- Summary `report.json` with counts and notes.
- Paginates both `/conversations` and `/transcriptions` with `per_page` capped at API max (100).
- Checks recording presence via `/conversations/{id}/recording` (signed URL existence ⇒ recording exists).
- Retries with exponential backoff on `429/5xx` and honors `Retry-After`.
- Incremental runs via `--since` (applies to `/transcriptions` using `updated_at[gte]`).

### Requirements

- Python 3.9+
- Env var `SALESLOFT_TOKEN` with OAuth scopes granting access to Conversations/Transcriptions.
  - Org must allow "Download Conversations" to obtain signed media/artifact URLs.

Install dependencies (only standard `requests` is used; often preinstalled):

```bash
pip install -r requirements.txt
```

### Usage

```bash
export SALESLOFT_TOKEN="<your_token>"
python salesloft_export.py --out ./out \
  [--since "2025-01-01T00:00:00Z"] \
  [--export-sentences] \
  [--no-enrich] [--attendee-scan-limit 300] [--progress-every 200] \
  [--export-lookups] [--enrich-from-lookups] [--lookups-dir lookups]
```

Flags

- `--since`: ISO8601 string. Sets `updated_at[gte]` when listing `/transcriptions`. Useful for incremental runs. Note that counts for "conversations_with_transcript" reflect the filtered transcriptions window; add/remove the flag accordingly for full-account vs incremental reports.
- `--export-sentences`: Also export `/transcriptions/{id}/sentences` to `out/sentences.csv`.
- `--out`: Output directory (default `./out`).
- `--recording-workers`: Concurrency for recording checks (default 8).
- `--download-workers`: Concurrency for artifact/sentence fetches (default 6).
- `--enrich` / `--no-enrich`: Toggle enrichment of artifact JSONs (default on).
- `--attendee-scan-limit`: When enriching, max sentences scanned to build attendee name mapping (default 300).
- `--progress-every`: Print progress every N items (0 disables; default 200).
- `--export-lookups`: Export People, Accounts, Users lookup tables to `out/lookups/`.
- `--enrich-from-lookups`: Enrich existing transcript JSONs locally (no API calls) using lookup tables to map attendee emails → People/Accounts.
- `--lookups-dir`: Subdirectory under `--out` for lookup JSONs (default `lookups`).

### Offline enrichment using lookups

1) Export lookup tables

```bash
python salesloft_export.py --out ./out --export-lookups
```

2) Enrich existing transcripts locally (no API calls)

```bash
python salesloft_export.py --out ./out --enrich-from-lookups --no-enrich --progress-every 200
```

Notes:
- Local enrichment reads `out/lookups/people.json`, `out/lookups/accounts.json`, and `out/lookups/users.json`.
- It updates each `out/transcripts/{id}.json` that has `export_enrichment.attendees` with emails, attaching `attendee_matches` with `person_id`, `person_name`, `account_id`, and `account_name`.
- If a JSON lacks attendee emails, it is skipped (you can run a prior pass with a small `--attendee-scan-limit` to populate emails if needed).

### v2 Pipeline (SQLite manifest)

New, more robust CLI at `scripts/integrations/salesloft_export_v2/` with a resumable, step‑wise pipeline backed by SQLite.

Basic flow:

```bash
export SALESLOFT_TOKEN="<your_token>"
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 index --since "2025-01-01T00:00:00Z"
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 artifacts
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 convmeta
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 capture-attendees --sentences 25
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 export-lookups
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 enrich-local --progress-every 1000
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 report
```

One‑shot:

```bash
python -m scripts.integrations.salesloft_export_v2.main --out ./out-v2 all --since "2025-01-01T00:00:00Z"
```

Manifest DB: `out-v2/manifest/salesloft.sqlite` tracks transcription states, enabling safe resume and clean progress accounting.

### Outputs

- `out/transcripts/{id}.json`: One file per transcription artifact (downloaded via signed URL).
  - Augmented with `export_enrichment`:
    ```json
    {
      "export_enrichment": {
        "generated_at": "2025-09-09T12:34:56Z",
        "conversation": {
          "conversation_id": "uuid",
          "title": "...",
          "platform": "zoom",
          "media_type": "video",
          "started_recording_at": "2025-09-08T18:12:48Z",
          "call_date": "2025-09-08"
        },
        "attendees": {
          "attendee_uuid": { "display_name": "Jane Doe", "email": "jane@example.com" }
        }
      },
      "...original artifact fields...": {}
    }
    ```
- `out/sentences.csv` (optional): Sentence rows.
- `out/report.json`:

```json
{
  "generated_at": "2025-09-09T00:00:00Z",
  "total_conversations": 0,
  "conversations_with_recording": 0,
  "conversations_with_transcript": 0,
  "recording_but_no_transcript": 0,
  "notes": "Any warnings or filters applied"
}
```

The script prints a one-line summary upon completion:

```
Convos: X | Recs: Y | Transcripts: Z | Gaps: W | Saved: N files
```

### How it works (Core Logic)

1. List conversations: `GET /conversations?per_page=200&page=N` until exhausted.
2. For each conversation id: `GET /conversations/{id}/recording`. If HTTP 200 with non-empty `data.url`, mark `has_recording = true`.
3. List transcriptions: `GET /transcriptions?per_page=200&page=N` (and `updated_at[gte]` if `--since`). Build `conversation_ids_with_transcript` from each item's `conversation.id`.
4. Export each transcription:
   - `GET /transcriptions/{id}/artifact` → signed URL → download JSON to `out/transcripts/{id}.json`.
   - Optional: `GET /transcriptions/{id}/sentences` → append to `out/sentences.csv`.
5. Counts:
   - `total_conversations`: number of conversations returned.
   - `conversations_with_recording`: count with `has_recording = true`.
   - `conversations_with_transcript`: size of `conversation_ids_with_transcript`.
   - `recording_but_no_transcript`: number of conversations where `has_recording` is true AND `id` not in the set from transcriptions.

### Notes & Edge Cases

- Signed URLs expire; artifacts are downloaded immediately after URL retrieval.
- Conversations may be audio or video; both treated equally for counts.
- A conversation can have a recording but no transcript (e.g., processing pending, unsupported language, too short, etc.). The gap metric reflects this.
- Incremental mode (`--since`) filters the transcriptions side only. If you need full-account counts that match the UI, omit `--since`.
- Re-runs are idempotent for artifacts: existing `out/transcripts/{id}.json` files are not overwritten. Sentences CSV appends rows; avoid duplicates by re-running with a later `--since`.

### Troubleshooting

- Missing token: ensure `SALESLOFT_TOKEN` is exported in your shell.
- 429 rate limits: the tool backs off and retries. You can reduce concurrency via `--recording-workers`/`--download-workers` if you hit limits.
- Corporate proxies: set `HTTPS_PROXY`/`HTTP_PROXY` environment variables as needed.
