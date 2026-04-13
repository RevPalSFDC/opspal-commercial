# Rotation Policy

Rotate on an explicit size threshold and reopen a fresh active log. Include timestamped archives and avoid partial-write corruption.

## Size-Based Rotation (Primary Strategy)

Rotate when the active file exceeds a configurable byte limit. Defaults are environment-variable-driven so they can be tuned without code changes.

```bash
LOG_FILE="${HOME}/.claude/logs/${HOOK_NAME}.jsonl"
MAX_BYTES="${LOG_MAX_BYTES:-5242880}"   # 5 MB default

rotate_if_needed() {
  local file="$1"
  if [[ ! -f "$file" ]]; then return; fi

  # stat -c on Linux; stat -f on macOS
  local size
  size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)

  if [[ "$size" -gt "$MAX_BYTES" ]]; then
    local archive="${file}.$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$file" "$archive"
    # Reopen active file immediately (touch ensures writers don't error)
    touch "$file"
    echo "[log-rotation] rotated $file -> $(basename "$archive")" >&2
  fi
}

rotate_if_needed "$LOG_FILE"
printf '%s\n' "$LOG_ENTRY" >> "$LOG_FILE"
```

## Time-Based Rotation (Secondary Strategy)

Create a new log file each calendar day. Avoids size monitoring overhead for low-volume hooks.

```bash
LOG_FILE="${HOME}/.claude/logs/${HOOK_NAME}-$(date +%Y%m%d).jsonl"
printf '%s\n' "$LOG_ENTRY" >> "$LOG_FILE"
```

Combine with a cleanup step (see Retention Policy) that purges files older than N days.

## Count-Based Archive Pruning

After rotating, keep at most `LOG_MAX_ARCHIVES` archived copies:

```bash
prune_archives() {
  local base="$1"
  local max="${LOG_MAX_ARCHIVES:-5}"
  # List archives newest-first, delete the oldest beyond the limit
  ls -t "${base}".* 2>/dev/null | tail -n +"$((max + 1))" | xargs -r rm -f
}

prune_archives "$LOG_FILE"
```

## Avoiding Partial-Write Corruption

Never truncate in place (`> $LOG_FILE`) — in-progress appenders will write to the truncated file producing mixed content. Instead:

1. `mv` the active file to the archive path (atomic rename on POSIX).
2. `touch` a fresh active file before any writer can error on missing file.
3. Writers that hold an open file descriptor to the old inode keep appending to the archive — that is acceptable.

## Cross-Platform `stat` Portability

```bash
file_size() {
  local f="$1"
  stat -c%s "$f" 2>/dev/null \
    || stat -f%z "$f" 2>/dev/null \
    || wc -c < "$f" 2>/dev/null \
    || echo 0
}
```

## logrotate Integration (System-Level)

For installations where hooks run as a persistent process or via scheduled cron, drop a logrotate config:

```
# /etc/logrotate.d/opspal-hooks
/home/*/.claude/logs/*.jsonl {
  daily
  rotate 7
  compress
  missingok
  notifempty
  copytruncate    # safe for append-only writers without file reopen
  maxsize 10M
}
```

`copytruncate` is safer than `postrotate`/`create` for shell scripts that hold log FDs open.

## Thresholds Table

| Log Category | Default Max Size | Default Max Archives |
|-------------|-----------------|----------------------|
| Hook JSONL logs | 5 MB | 5 |
| Audit trail | 10 MB | 10 |
| Circuit breaker metrics | 2 MB | 3 |
| API quota logs | 1 MB | 5 |
| Error/crash logs | 2 MB | 3 |
