# Operations Checks

Verify the rotation, retention, and JSONL format behavior end-to-end.

## Rotation Trigger Check

Confirm that rotation fires exactly at the size threshold crossing — not before, not after:

```bash
# Create a log file that is just under the threshold
LOG_FILE="/tmp/test-rotation.jsonl"
MAX_BYTES=102400   # 100 KB for testing

# Fill to just under the limit
python3 -c "
import json, random, string
for i in range(1000):
    entry = {'ts': '2026-04-12T00:00:00Z', 'hook': 'test', 'i': i}
    print(json.dumps(entry))
" > "$LOG_FILE"

# Confirm no rotation yet
ls "${LOG_FILE}".* 2>/dev/null && echo "FAIL: rotated too early" || echo "OK: no premature rotation"

# Add one more line to cross threshold... then call rotate_if_needed
# Verify archive exists and active file is empty/new
ls "${LOG_FILE}".* 2>/dev/null | wc -l
```

## JSONL Validity Check

Every line in a JSONL log file must be independently parseable:

```bash
# Validate all lines in a JSONL log
validate_jsonl() {
  local file="$1"
  local line_num=0
  local errors=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line_num=$((line_num + 1))
    if [[ -z "$line" ]]; then continue; fi   # skip blank lines
    if ! printf '%s' "$line" | jq -e . >/dev/null 2>&1; then
      echo "FAIL: line $line_num is not valid JSON: ${line:0:80}"
      errors=$((errors + 1))
    fi
  done < "$file"

  if [[ $errors -eq 0 ]]; then
    echo "OK: all $line_num lines are valid JSON"
  else
    echo "FAIL: $errors invalid lines found"
    return 1
  fi
}

validate_jsonl "${HOME}/.claude/logs/routing.jsonl"
```

## Post-Rotation Continuity Check

After rotation, hooks must continue writing to the new active file without error:

```bash
# Simulate two hook calls surrounding a rotation event
LOG_FILE="/tmp/test-hook-continuity.jsonl"
MAX_BYTES=1   # 1 byte — triggers immediately for test

# Write first entry (triggers rotation)
echo '{"ts":"2026-04-12T00:00:00Z","hook":"test","step":1}' >> "$LOG_FILE"
rotate_if_needed "$LOG_FILE"   # should rotate to archive

# Write second entry — must land in fresh file, not archive
echo '{"ts":"2026-04-12T00:00:01Z","hook":"test","step":2}' >> "$LOG_FILE"

ACTIVE_LINES=$(wc -l < "$LOG_FILE")
ARCHIVE_COUNT=$(ls "${LOG_FILE}".* 2>/dev/null | wc -l)

echo "Active file lines: $ACTIVE_LINES (expect 1)"
echo "Archive count: $ARCHIVE_COUNT (expect 1)"
```

## Archive Count Enforcement

Verify that archive pruning removes the oldest files first:

```bash
# Create 6 fake archives (max is 5)
for i in $(seq 1 6); do
  touch "/tmp/test-hook.jsonl.2026041${i}T000000Z"
  sleep 0.01  # ensure distinct mtime
done

cap_archives "/tmp/test-hook.jsonl" 5

REMAINING=$(ls /tmp/test-hook.jsonl.* 2>/dev/null | wc -l)
echo "Archives after cap: $REMAINING (expect 5)"
OLDEST=$(ls -t /tmp/test-hook.jsonl.* 2>/dev/null | tail -1)
echo "Oldest retained: $(basename "$OLDEST")"
```

## Age-Based Purge Check

Confirm that files older than the threshold are removed:

```bash
# Create a file with old mtime
touch -t 202603010000 /tmp/test-hook.jsonl.20260301T000000Z   # 42 days ago
touch /tmp/test-hook.jsonl.20260411T000000Z                   # 1 day ago

purge_old_archives /tmp 30

ls /tmp/test-hook.jsonl.20260301T000000Z 2>/dev/null && echo "FAIL: old file not purged" || echo "OK: old file purged"
ls /tmp/test-hook.jsonl.20260411T000000Z 2>/dev/null && echo "OK: recent file retained" || echo "FAIL: recent file removed"
```

## Hook Continuity After Rotation (Live Smoke Test)

Run a quick live test from the session-start hook itself:

```bash
smoke_test_rotation() {
  local test_log="/tmp/hook-rotation-smoke.jsonl"
  echo '{"test":true}' > "$test_log"
  rotate_if_needed "$test_log"  # should not rotate (1 byte)
  if [[ -f "$test_log" ]]; then
    echo "[smoke] OK: log rotation guard passed"
  else
    echo "[smoke] FAIL: log file disappeared unexpectedly" >&2
  fi
  rm -f "$test_log"
}
```

## JSONL Required Fields

Every hook log entry must include:

| Field | Type | Description |
|-------|------|-------------|
| `ts` | ISO 8601 UTC | Timestamp of the event |
| `hook` | string | Hook script name (no path) |
| `decision` | string | `allow`, `deny`, `advisory`, `bypass` |
| `tool` | string | Claude Code tool name |
| `duration_ms` | number | Hook execution time in milliseconds |

Optional fields: `org`, `agent`, `reason`, `risk_score`, `circuit_state`.
