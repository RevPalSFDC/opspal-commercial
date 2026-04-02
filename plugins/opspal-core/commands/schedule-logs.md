---
name: schedule-logs
description: View execution logs and history for a scheduled task
argument-hint: "<task-id> [--limit=N] [--tail=N]"
---

# View Task Logs

Display execution logs and history for a scheduled task.

## Usage

```bash
# View recent logs for a task
/schedule-logs <task-id>

# Limit number of log files shown
/schedule-logs <task-id> --limit=5

# Show only last N lines of most recent log
/schedule-logs <task-id> --tail=50
```

## Output

```
Logs for daily-cpq-check-a1b2c3d4 (showing 3 of 15):

--- daily-cpq-check-a1b2c3d4_20251206_060000.log (2025-12-06T06:00:45Z) ---
=== Claude Code Scheduled Task ===
Task: Daily CPQ Check
Time: Fri Dec 6 06:00:00 EST 2025
Prompt: Run CPQ health check...
===================================

[Claude output here...]

===================================
Exit Code: 0
Duration: 45s
Status: success
===================================

--- daily-cpq-check-a1b2c3d4_20251205_060000.log (2025-12-05T06:00:38Z) ---
...
```

## Options

| Option | Description |
|--------|-------------|
| `--limit=N` | Show only N most recent log files (default: 10) |
| `--tail=N` | Show only last N lines of each log |

## Execution History

View structured execution history:

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

# Via scheduler manager directly
node "$(find_script "scheduler-manager.js")" history daily-cpq-check-a1b2c3d4
```

Output:
```
Execution History for daily-cpq-check-a1b2c3d4 (20 entries):

2025-12-06T06:00:45Z | daily-cpq-check-a1b2c3d4    | success  | 45s | exit: 0
2025-12-05T06:00:38Z | daily-cpq-check-a1b2c3d4    | success  | 38s | exit: 0
2025-12-04T06:00:52Z | daily-cpq-check-a1b2c3d4    | failure  | 52s | exit: 1
```

## Log File Location

Logs are stored in:
```
.claude-plugins/opspal-core/scheduler/logs/
├── <task-id>_<timestamp>.log    # Individual execution logs
├── execution-history.jsonl       # Structured execution history
└── cron.log                      # Cron stderr output
```

## Troubleshooting Failed Tasks

1. **View recent logs**:
   ```bash
   /schedule-logs <task-id> --limit=1
   ```

2. **Check full log content**:
   ```bash
   cat .claude-plugins/opspal-core/scheduler/logs/<task-id>_*.log | tail -100
   ```

3. **Look for timeout issues**:
   ```bash
   grep "TIMED OUT" .claude-plugins/opspal-core/scheduler/logs/<task-id>_*.log
   ```

4. **Run manually to debug**:
   ```bash
   /schedule-run <task-id>
   ```

## Log Retention

Logs are retained for 30 days by default. Older logs can be cleaned up:

```bash
find .claude-plugins/opspal-core/scheduler/logs -name "*.log" -mtime +30 -delete
```

## See Also

- `/schedule-run` - Run a task immediately
- `/schedule-list` - List all tasks
