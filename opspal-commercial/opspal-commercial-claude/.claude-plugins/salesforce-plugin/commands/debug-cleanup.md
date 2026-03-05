---
description: Clean up expired trace flags and old debug logs from a Salesforce org
---

Clean up debugging resources by deleting expired TraceFlags, orphaned DebugLevels, and old debug logs.

This command will:
- **Delete expired TraceFlags** that are past their expiration date
- **Delete orphaned DebugLevels** created by OpsPal sessions with no active trace flags
- **Delete old debug logs** older than specified retention period
- **Report storage savings** after cleanup

**Target Org**: {org-alias} (required)

**Options** (optional flags):
- `--retention <days>`: Keep logs newer than N days (default: 7)
- `--dry-run`: Show what would be deleted without actually deleting
- `--logs-only`: Only clean up old logs, not trace flags
- `--trace-flags-only`: Only clean up trace flags, not logs

**Output**: Summary of cleanup actions and storage savings

**Examples**:
```bash
# Standard cleanup (7-day retention)
/debug-cleanup myorg

# Aggressive cleanup (keep only 3 days of logs)
/debug-cleanup myorg --retention 3

# Preview what would be deleted
/debug-cleanup myorg --dry-run

# Only clean up expired trace flags
/debug-cleanup myorg --trace-flags-only

# Only clean up old logs (keep trace flags)
/debug-cleanup myorg --logs-only
```

**Programmatic Usage**:
```bash
# Full cleanup with custom retention
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager.js cleanup myorg --retention 7

# Dry run to preview
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager.js cleanup myorg --dry-run

# Trace flags only
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager.js cleanup myorg --trace-flags-only
```

**JavaScript API**:
```javascript
const { DebugLogManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager');

const manager = new DebugLogManager('myorg', { verbose: true });

// Full cleanup
const result = await manager.fullCleanup({
  retentionDays: 7,
  dryRun: false
});

console.log(`Deleted ${result.traceFlagsDeleted} trace flags`);
console.log(`Deleted ${result.debugLevelsDeleted} debug levels`);
console.log(`Deleted ${result.logsDeleted} logs`);
console.log(`Freed ${result.storageSavedMB} MB`);
```

**What Gets Cleaned**:

1. **Expired Trace Flags** (~2-5 seconds)
   - Trace flags past their `ExpirationDate`
   - Includes both user-created and OpsPal-created flags
   - Frees up trace flag slots (limit varies by org edition)

2. **Orphaned Debug Levels** (~2-3 seconds)
   - `OpsPal_*_Level` debug levels with no active trace flags
   - Does NOT delete system or custom-named levels
   - Keeps org clean and organized

3. **Old Debug Logs** (~5-30 seconds depending on volume)
   - Logs older than retention period (default 7 days)
   - Most impactful for storage savings
   - Respects org's debug log storage limit (typically 1GB)

**Output Example**:
```
Debug Cleanup Summary:
  Expired Trace Flags: 5 deleted
  Orphaned Debug Levels: 2 deleted
  Old Logs (>7 days): 142 deleted
  Storage Freed: 45.2 MB

Current Storage:
  Total Logs: 58 remaining
  Storage Used: 12.3 MB (1.2% of 1 GB limit)

Elapsed: 3.2s
```

**Dry Run Output Example**:
```
[DRY RUN] Would delete:
  Expired Trace Flags: 5
    - 0TF000000000001 (expired 2 days ago)
    - 0TF000000000002 (expired 5 days ago)
    ...

  Orphaned Debug Levels: 2
    - OpsPal_standard_Level
    - OpsPal_detailed_Level

  Old Logs (>7 days): 142 logs (45.2 MB)

No changes made. Run without --dry-run to execute.
```

**Scheduled Cleanup Recommendations**:

| Environment | Frequency | Retention | Command |
|-------------|-----------|-----------|---------|
| Production | Weekly | 7 days | `/debug-cleanup prod --retention 7` |
| Sandbox (active) | Weekly | 3 days | `/debug-cleanup sbx --retention 3` |
| Sandbox (idle) | Monthly | 1 day | `/debug-cleanup sbx --retention 1` |
| Dev org | As needed | 3 days | `/debug-cleanup dev --retention 3` |

**Exit Codes**:
- `0` - Cleanup completed successfully
- `1` - Cleanup failed (check error message)
- `2` - Nothing to clean up (already clean)

**Troubleshooting**:

| Error | Cause | Solution |
|-------|-------|----------|
| `Failed to delete trace flag` | Permission issue | Need "Modify All Data" permission |
| `Failed to delete log` | Log locked by system | Retry in a few minutes |
| `Storage query failed` | API limit reached | Wait and retry |
| `Partial cleanup` | Some items couldn't be deleted | Run again or manually delete |

**Storage Management Best Practices**:

1. **Monitor Usage**: Check storage regularly with `/apex-logs myorg --storage`
2. **Proactive Cleanup**: Don't wait until hitting limits
3. **Right-size Logging**: Use appropriate presets to avoid oversized logs
4. **Production Discipline**: Shorter durations, prompt cleanup
5. **Sandbox Freedom**: More aggressive cleanup is safe

**Integration with Debug Workflow**:
```bash
# 1. Start debugging
/debug-start myorg --level detailed --duration 30

# 2. Reproduce and capture
# (trigger automation)

# 3. Analyze logs
/apex-logs myorg --latest

# 4. Stop and cleanup session resources
/debug-stop myorg

# 5. Periodic maintenance (weekly)
/debug-cleanup myorg
```

**Related Commands**:
- `/debug-start` - Start debug log capture
- `/debug-stop` - Stop debug logging and cleanup session
- `/apex-logs` - Retrieve and analyze logs
- `/monitor-logs` - Real-time log monitoring

**Use the debug-log-manager script to clean up expired trace flags, orphaned debug levels, and old debug logs from the {org-alias} Salesforce org. Report storage savings after cleanup.**
