---
name: schedule-list
description: List all scheduled tasks with their status and schedule
argument-hint: "[--enabled | --disabled | --json]"
---

# List Scheduled Tasks

Display all configured scheduled tasks with their status, schedule, and configuration.

## Usage

```bash
# List all tasks
/schedule-list

# List only enabled tasks
/schedule-list --enabled

# List only disabled tasks
/schedule-list --disabled

# Output as JSON
/schedule-list --json
```

## Output Format

```
Scheduled Tasks (3 total):

[✓] daily-cpq-check-a1b2c3d4
    Name:     Daily CPQ Check
    Type:     claude-prompt
    Schedule: 0 6 * * * (Daily at 6:00 AM)
    Timeout:  600s

[✓] weekly-report-b2c3d4e5
    Name:     Weekly Report
    Type:     script
    Schedule: 0 8 * * 0 (Weekly Sunday at 8:00 AM)
    Timeout:  600s

[✗] monthly-audit-c3d4e5f6 (DISABLED)
    Name:     Monthly Audit
    Type:     hybrid
    Schedule: 0 2 1 * * (Monthly 1st at 2:00 AM)
    Timeout:  1800s
```

## Status Indicators

| Symbol | Meaning |
|--------|---------|
| `[✓]` | Task is enabled and scheduled |
| `[✗]` | Task is disabled (won't run) |

## Actions from List

After viewing the list, you can:

- **Enable a task**: `/schedule-enable <task-id>`
- **Disable a task**: `/schedule-disable <task-id>`
- **Run immediately**: `/schedule-run <task-id>`
- **View logs**: `/schedule-logs <task-id>`
- **Remove**: `/schedule-remove <task-id>`

## Example Workflow

```bash
# Check what's scheduled
/schedule-list

# Run the daily check now to test
/schedule-run daily-cpq-check-a1b2c3d4

# Check the output
/schedule-logs daily-cpq-check-a1b2c3d4

# Disable if needed
/schedule-disable daily-cpq-check-a1b2c3d4
```

## See Also

- `/schedule-add` - Add a new task
- `/schedule-run` - Run a task immediately
- `/schedule-logs` - View execution logs
