---
name: hook-log-retention-and-rotation-framework
description: Standardize Salesforce hook log size rotation and retention to prevent oversized files and runaway disk growth.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hook Log Retention and Rotation

## When to Use This Skill

Use this skill when:
- Hook log files in `~/.claude/logs/` are growing unbounded
- Implementing log rotation for hook JSONL output files
- Setting retention policies for routing logs, audit logs, and error logs
- Diagnosing disk space issues caused by verbose hook logging

**Not for**: Hook execution hardening (use `hook-inline-node-execution-hardening-framework`), hook governance policy (use `salesforce-hook-governance-framework`), or observability setup (use `hook-observability-standardizer`).

## Log File Inventory

| Log File | Location | Growth Rate | Purpose |
|----------|----------|-------------|---------|
| `routing.jsonl` | `~/.claude/logs/` | ~1KB per tool call | Routing decisions |
| `hook-errors.log` | `~/.claude/logs/` | Variable | Hook execution failures |
| `audit-log.jsonl` | `~/.claude/logs/` | ~500B per mutation | Mutation audit trail |
| `api-limits.jsonl` | `~/.claude/api-limits/` | ~200B per API call | API rate tracking |

## Rotation Policy

### Size-Based Rotation (Recommended)

```bash
# In hook scripts, rotate before appending
LOG_FILE="${HOME}/.claude/logs/routing.jsonl"
MAX_SIZE=5242880  # 5MB

if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)" -gt "$MAX_SIZE" ]; then
  mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d%H%M%S).bak"
  # Keep only last 3 backups
  ls -t "${LOG_FILE}".*.bak 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null
fi
echo "$LOG_ENTRY" >> "$LOG_FILE"
```

### Retention Thresholds

| Log Type | Max Size | Max Age | Max Backups |
|----------|----------|---------|-------------|
| Routing logs | 5MB | 7 days | 3 |
| Audit logs | 10MB | 30 days | 5 |
| Error logs | 2MB | 14 days | 3 |
| API limit logs | 1MB | 7 days | 2 |

### JSONL Format Best Practice

```jsonl
{"ts":"2026-04-12T14:30:00Z","hook":"pre-tool-execution","decision":"allow","tool":"Bash","duration_ms":12}
{"ts":"2026-04-12T14:30:01Z","hook":"routing-advisory","agent":"sfdc-query-specialist","score":0.85,"duration_ms":45}
```

Each line must be self-contained valid JSON. Never write multi-line JSON to JSONL files.

## Workflow

1. Identify which log files exist and their current sizes
2. Apply size-based rotation with backup count limit
3. Set age-based cleanup via cron or session-start hook
4. Verify rotation works by checking file sizes after heavy sessions

## References

- [Rotation Policy](./rotation-policy.md)
- [Retention Policy](./retention-policy.md)
- [Operations Checks](./operations-checks.md)
