---
name: schedule-enable
description: Enable a disabled scheduled task
argument-hint: "<task-id>"
---

# Enable Scheduled Task

Enable a previously disabled scheduled task so it runs on its configured schedule.

## Usage

```bash
/schedule-enable <task-id>
```

## Example

```bash
# List tasks to see which are disabled
/schedule-list --disabled

# Enable the task
/schedule-enable monthly-audit-c3d4e5f6
```

## What Happens

1. Task's `enabled` flag is set to `true`
2. Crontab is updated to include the task
3. Task will run at the next scheduled time

## Output

```
✓ Enabled task: Monthly Audit
Crontab updated.
```

## Related: Disable a Task

To temporarily stop a task without removing it:

```bash
/schedule-disable <task-id>
```

## See Also

- `/schedule-disable` - Disable a task
- `/schedule-list` - List all tasks
- `/schedule-run` - Run immediately
