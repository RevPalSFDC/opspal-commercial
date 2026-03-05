---
name: schedule-disable
description: Disable a scheduled task without removing it
argument-hint: "<task-id>"
---

# Disable Scheduled Task

Temporarily disable a scheduled task. The task configuration is preserved but it won't run until re-enabled.

## Usage

```bash
/schedule-disable <task-id>
```

## Example

```bash
# Disable a task
/schedule-disable daily-cpq-check-a1b2c3d4

# Verify it's disabled
/schedule-list
```

## What Happens

1. Task's `enabled` flag is set to `false`
2. Crontab entry is removed
3. Task configuration is preserved
4. Can be re-enabled anytime

## Output

```
✓ Disabled task: Daily CPQ Check
Crontab updated.
```

## When to Use

- **Maintenance**: Temporarily stop tasks during system changes
- **Testing**: Disable production tasks while testing
- **Troubleshooting**: Stop a failing task while investigating
- **Vacation**: Pause non-critical tasks

## Re-enable Later

```bash
/schedule-enable daily-cpq-check-a1b2c3d4
```

## Alternative: Remove Completely

If you don't need the task anymore:

```bash
/schedule-remove daily-cpq-check-a1b2c3d4
```

## See Also

- `/schedule-enable` - Re-enable a task
- `/schedule-remove` - Remove permanently
- `/schedule-list` - List all tasks
