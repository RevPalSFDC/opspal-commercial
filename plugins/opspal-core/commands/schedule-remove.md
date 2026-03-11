---
name: schedule-remove
description: Remove a scheduled task by its ID
argument-hint: "<task-id>"
---

# Remove Scheduled Task

Remove a scheduled task and its cron entry.

## Usage

```bash
/schedule-remove <task-id>
```

## Example

```bash
# First, list tasks to find the ID
/schedule-list

# Remove the task
/schedule-remove daily-cpq-check-a1b2c3d4
```

## What Happens

1. Task is removed from `scheduler-config.json`
2. Crontab entry is automatically removed
3. Existing log files are **preserved** (not deleted)

## Confirmation

The command will show what was removed:

```
✓ Removed task: Daily CPQ Check (daily-cpq-check-a1b2c3d4)
Crontab updated.
```

## Recovering Logs

Even after removing a task, you can still access its historical logs:

```bash
ls ${CLAUDE_PLUGIN_ROOT}/scheduler/logs/ | grep daily-cpq-check
```

## Alternative: Disable Instead

If you might want to re-enable the task later, consider disabling instead:

```bash
/schedule-disable daily-cpq-check-a1b2c3d4
```

This keeps the configuration but stops execution.

## See Also

- `/schedule-list` - List all tasks
- `/schedule-disable` - Disable without removing
