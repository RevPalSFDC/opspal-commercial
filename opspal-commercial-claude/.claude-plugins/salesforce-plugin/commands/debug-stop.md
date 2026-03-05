---
description: Stop debug log capture and cleanup trace flags on a Salesforce org
---

Stop capturing debug logs by deleting TraceFlags and optionally cleaning up old logs.

This command will:
- **Delete active TraceFlags** created by the current session
- **Optionally delete all active TraceFlags** (with `--all` flag)
- **Clean up DebugLevels** created by the session
- **Optionally delete old logs** (unless `--keep-logs` specified)

**Target Org**: {org-alias} (required)

**Options** (optional flags):
- `--all`: Delete all active trace flags (not just session-created)
- `--keep-logs`: Don't delete old debug logs during cleanup
- `--user <email>`: Only stop tracing for specific user

**Output**: Summary of cleanup actions performed

**Examples**:
```bash
# Stop debug logging (cleanup session resources)
/debug-stop myorg

# Stop all active trace flags
/debug-stop myorg --all

# Stop but keep logs for later analysis
/debug-stop myorg --keep-logs

# Stop tracing specific user only
/debug-stop myorg --user admin@company.com --all
```

**Programmatic Usage**:
```bash
# Stop with all flags
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager.js stop myorg --all

# Stop but keep logs
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager.js stop myorg --keep-logs
```

**JavaScript API**:
```javascript
const { DebugLogManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager');

const manager = new DebugLogManager('myorg', { verbose: true });

// Stop and cleanup
const result = await manager.stopDebugLogging({
  all: true,        // Delete all active trace flags
  keepLogs: false   // Also delete old logs
});

console.log(`Cleaned up ${result.traceFlagsDeleted} trace flags`);
console.log(`Deleted ${result.logsDeleted} old logs`);
```

**Cleanup Actions**:

1. **Trace Flags** (~2-5 seconds)
   - Deletes session-created trace flags
   - With `--all`: deletes all active trace flags
   - With `--user`: filters to specific user

2. **Debug Levels** (~1-2 seconds)
   - Deletes `OpsPal_*_Level` debug levels created by session
   - Only removes orphaned levels (no active trace flags)

3. **Old Logs** (~5-10 seconds, unless `--keep-logs`)
   - Deletes logs older than 7 days
   - Helps manage storage quota

**Output Example**:
```
Debug logging stopped:
  Trace Flags Deleted: 2
  Debug Levels Deleted: 1
  Old Logs Deleted: 15

Elapsed: 1.2s
```

**When to Use Each Option**:

| Scenario | Command |
|----------|---------|
| Done debugging, normal cleanup | `/debug-stop myorg` |
| Want to analyze logs later | `/debug-stop myorg --keep-logs` |
| Clear all trace flags (troubleshooting) | `/debug-stop myorg --all` |
| Stop one user, keep others | `/debug-stop myorg --user admin@company.com --all` |

**Exit Codes**:
- `0` - Cleanup completed successfully
- `1` - Cleanup failed (check error message)

**Troubleshooting**:

| Error | Cause | Solution |
|-------|-------|----------|
| `No trace flags to delete` | Already expired or deleted | Normal - no action needed |
| `Failed to delete trace flag` | Permission issue | Need "Modify All Data" permission |
| `Partial cleanup` | Some resources couldn't be deleted | Run again or manually delete via Setup |

**Best Practices**:

1. **Always stop when done**: Running trace flags consume resources
2. **Use `--keep-logs` for complex issues**: Logs can be analyzed later
3. **Clean up periodically**: Run `/debug-cleanup` weekly in sandboxes
4. **Production**: Use shortest durations, always cleanup promptly

**Typical Workflow**:
```bash
# 1. Start debugging
/debug-start myorg --level detailed --duration 30

# 2. Reproduce issue
# (trigger automation, test feature, etc.)

# 3. Analyze logs
/apex-logs myorg --latest
/apex-logs myorg --log-id 07Lxx000000XXXX --save ./debug.log

# 4. Stop and cleanup
/debug-stop myorg

# Or if you need to keep logs for later:
/debug-stop myorg --keep-logs
```

**Related Commands**:
- `/debug-start` - Start debug log capture
- `/apex-logs` - Retrieve and analyze logs
- `/debug-cleanup` - Cleanup expired trace flags and old logs
- `/monitor-logs` - Real-time log monitoring

**Use the debug-log-manager script to stop debug logging on the {org-alias} Salesforce org. Delete active trace flags and optionally clean up old debug logs.**
