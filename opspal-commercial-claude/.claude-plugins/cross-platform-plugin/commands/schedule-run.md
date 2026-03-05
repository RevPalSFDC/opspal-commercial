---
name: schedule-run
description: Manually run a scheduled task immediately for testing
argument-hint: "<task-id>"
---

# Run Scheduled Task

Execute a scheduled task immediately without waiting for its scheduled time. Useful for testing and verification.

## Usage

```bash
/schedule-run <task-id>
```

## Example

```bash
# List tasks to find the ID
/schedule-list

# Run immediately
/schedule-run daily-cpq-check-a1b2c3d4
```

## What Happens

1. Task executes with the same configuration as scheduled runs
2. Output displays in real-time
3. Log file is created in `scheduler/logs/`
4. Execution history is recorded
5. Slack notifications sent if configured

## Output

```
Executing task: Daily CPQ Check (daily-cpq-check-a1b2c3d4)
Type: claude-prompt
Timeout: 600s

[INFO] [2025-12-06T10:30:00Z] Starting task: Daily CPQ Check
[INFO] [2025-12-06T10:30:00Z] Executing Claude prompt...
...
[SUCCESS] [2025-12-06T10:30:45Z] Task completed: Daily CPQ Check (45s)
```

## Testing Workflow

1. **Add a task**:
   ```bash
   /schedule-add --name="Test Task" --type=claude-prompt --schedule="0 6 * * *" --prompt="Hello world"
   ```

2. **Run immediately to test**:
   ```bash
   /schedule-run test-task-a1b2c3d4
   ```

3. **Check logs if needed**:
   ```bash
   /schedule-logs test-task-a1b2c3d4
   ```

4. **Adjust and repeat** or **remove if not needed**:
   ```bash
   /schedule-remove test-task-a1b2c3d4
   ```

## Notes

- **Disabled tasks can still be run manually** - useful for testing before enabling
- **Timeout applies** - task will be killed if it exceeds the configured timeout
- **Notifications trigger** - Slack notifications fire based on task config
- **Exit code** - Command exits with the task's exit code (0 = success)

## See Also

- `/schedule-logs` - View execution logs
- `/schedule-list` - List all tasks
- `/schedule-add` - Add a new task
