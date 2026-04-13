# Retention Policy

Enforce max archive count and/or max age. Purge oldest archives first and keep policy values configurable by env vars.

## Age-Based Purge

Delete archives older than a configurable number of days. Run during session-start hooks or a daily cron.

```bash
LOG_DIR="${HOME}/.claude/logs"
MAX_AGE_DAYS="${LOG_MAX_AGE_DAYS:-14}"   # default 14 days

purge_old_archives() {
  local dir="$1"
  local max_age="$2"
  find "$dir" -maxdepth 1 -name "*.jsonl.*" -type f \
    -mtime +"$max_age" -delete 2>/dev/null || true
  # Also purge compressed archives
  find "$dir" -maxdepth 1 -name "*.jsonl.*.gz" -type f \
    -mtime +"$max_age" -delete 2>/dev/null || true
}

purge_old_archives "$LOG_DIR" "$MAX_AGE_DAYS"
```

## Count-Based Cap

Keep at most N archive files per log name, independent of age:

```bash
cap_archives() {
  local base_name="$1"    # e.g. ~/.claude/logs/routing.jsonl
  local max_count="${2:-${LOG_MAX_ARCHIVES:-5}}"
  # Sort newest-first; remove everything beyond the cap
  ls -t "${base_name}".* 2>/dev/null | tail -n +"$((max_count + 1))" | xargs -r rm -f
}
```

## Combined Policy (Age + Count)

Apply both limits so neither disk nor inode counts grow unbounded:

```bash
enforce_retention() {
  local log_file="$1"
  local max_age="${LOG_MAX_AGE_DAYS:-14}"
  local max_count="${LOG_MAX_ARCHIVES:-5}"

  # Age-based sweep across the log directory
  local log_dir
  log_dir=$(dirname "$log_file")
  local log_base
  log_base=$(basename "$log_file")
  find "$log_dir" -maxdepth 1 -name "${log_base}.*" -type f \
    -mtime +"$max_age" -delete 2>/dev/null || true

  # Count-based cap (survivors of the age sweep)
  ls -t "${log_file}".* 2>/dev/null | tail -n +"$((max_count + 1))" | xargs -r rm -f
}
```

## Storage Budget Reference

```
~/.claude/logs/                   # Primary log directory
  hook-errors.log                 # Crash stack traces from hooks
  routing.jsonl                   # Routing advisory decisions
  audit-log.jsonl                 # Governance audit trail
  circuit-breaker-metrics.jsonl   # Circuit breaker state history
  *.jsonl.*                       # Time-stamped archives
~/.claude/hook-circuit-state.json # Circuit breaker current state
~/.claude/hook-metrics.json       # Last 1000 circuit breaker events (capped in code)
```

The `hook-metrics.json` file is self-capping: `jq '. += [$m] | .[-1000:]'` in `hook-circuit-breaker.sh` keeps it bounded at 1000 entries.

## Environment Variable Reference

| Variable | Default | Effect |
|----------|---------|--------|
| `LOG_MAX_BYTES` | 5242880 (5 MB) | Rotation threshold per file |
| `LOG_MAX_ARCHIVES` | 5 | Maximum archive copies per log |
| `LOG_MAX_AGE_DAYS` | 14 | Purge archives older than N days |
| `LOG_DIR` | `~/.claude/logs` | Override log directory |

## Session-Start Cleanup Hook

Wire the retention sweep into `session-start-sf-context.sh` so it runs once per session:

```bash
# In session-start-sf-context.sh — add near the end
purge_old_archives "${HOME}/.claude/logs" "${LOG_MAX_AGE_DAYS:-14}"
```

## Disk Usage Check

Alert when total log directory exceeds a budget:

```bash
LOG_DIR="${HOME}/.claude/logs"
WARN_BYTES="${LOG_DIR_WARN_BYTES:-52428800}"   # 50 MB

dir_size=$(du -sb "$LOG_DIR" 2>/dev/null | awk '{print $1}' || echo 0)
if [[ "$dir_size" -gt "$WARN_BYTES" ]]; then
  echo "[log-retention] WARNING: logs directory exceeds 50 MB (${dir_size} bytes). Consider reducing LOG_MAX_ARCHIVES or LOG_MAX_AGE_DAYS." >&2
fi
```
