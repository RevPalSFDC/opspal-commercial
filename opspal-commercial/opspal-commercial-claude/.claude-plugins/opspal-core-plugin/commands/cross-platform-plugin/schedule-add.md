---
name: schedule-add
description: Add a new scheduled task (Claude prompt or script) to run on a cron schedule
argument-hint: "[--name=NAME --type=TYPE --schedule=CRON --prompt=PROMPT|--command=CMD]"
---

# Add Scheduled Task

Add a new task to run Claude Code prompts or scripts on a cron schedule.

## Usage

### Interactive Mode
Simply run `/schedule-add` and I'll guide you through the configuration.

### Quick Mode with Arguments
```
/schedule-add --name="Task Name" --type=claude-prompt --schedule="0 6 * * *" --prompt="Your prompt here"
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--name` | Yes | Human-readable task name |
| `--type` | Yes | `claude-prompt`, `script`, or `hybrid` |
| `--schedule` | Yes | Cron expression (5 fields) |
| `--prompt` | For claude-prompt | The prompt to run via `claude -p` |
| `--command` | For script/hybrid | The bash/node command to execute |
| `--timeout` | No | Timeout in seconds (default: 600) |
| `--notify-on` | No | `failure`, `completion`, or both (comma-separated) |
| `--working-dir` | No | Working directory for execution |

## Task Types

### `claude-prompt`
Runs a prompt via `claude -p "prompt" --dangerously-skip-permissions`

```
/schedule-add --name="Daily Health Check" \
  --type=claude-prompt \
  --schedule="0 6 * * *" \
  --prompt="Check Salesforce API limits and report any issues"
```

### `script`
Runs a bash or node script directly

```
/schedule-add --name="Weekly Backup" \
  --type=script \
  --schedule="0 2 * * 0" \
  --command="node scripts/backup.js --org production"
```

### `hybrid`
Runs a script that may invoke Claude Code internally

```
/schedule-add --name="Audit with Analysis" \
  --type=hybrid \
  --schedule="0 2 * * 1" \
  --command="bash scripts/audit-and-analyze.sh"
```

## Cron Schedule Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|------------|---------|
| `0 6 * * *` | Daily at 6:00 AM |
| `0 8 * * 0` | Weekly Sunday at 8:00 AM |
| `0 * * * *` | Every hour |
| `*/15 * * * *` | Every 15 minutes |
| `0 2 * * 1` | Weekly Monday at 2:00 AM |
| `0 9 1 * *` | Monthly on the 1st at 9:00 AM |

## Notification Options

By default, only failures trigger Slack notifications. Customize with `--notify-on`:

- `failure` - Notify when task fails (default)
- `completion` - Notify when task completes successfully
- `failure,completion` - Notify on both

## Examples

### Daily Claude Prompt
```
/schedule-add \
  --name="Morning API Limits Check" \
  --type=claude-prompt \
  --schedule="0 6 * * *" \
  --prompt="Query Salesforce API limits for production org and alert if any are above 80%"
```

### Weekly Report Script
```
/schedule-add \
  --name="Weekly RevOps Report" \
  --type=script \
  --schedule="0 8 * * 1" \
  --command="node scripts/generate-revops-report.js --format pdf" \
  --notify-on="completion,failure"
```

### Monthly Audit
```
/schedule-add \
  --name="Monthly Security Audit" \
  --type=claude-prompt \
  --schedule="0 3 1 * *" \
  --prompt="Run a comprehensive security audit on the production Salesforce org" \
  --timeout=1800
```

## What Happens After Adding

1. Task is saved to `scheduler-config.json`
2. Crontab is automatically updated
3. Task will run at the specified schedule
4. Logs stored in `scheduler/logs/`
5. Slack notifications sent based on config

## See Also

- `/schedule-list` - View all scheduled tasks
- `/schedule-run` - Run a task immediately
- `/schedule-logs` - View task execution logs
- `/schedule-remove` - Remove a scheduled task
