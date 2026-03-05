---
description: Real-time debug log monitoring for a Salesforce org with filtering and alerting
---

Monitor Salesforce debug logs in real-time with filtering, error detection, and alerting.

This command will:
- **Poll for new debug logs** at configurable intervals
- **Parse log content** for errors and warnings
- **Filter logs** by user, operation type, or errors-only
- **Display formatted output** with error/warning highlights
- **Track statistics** (logs processed, errors found)

**Target Org**: {org-alias} (required)

**Options** (optional flags):
- `--interval <ms>`: Polling interval in milliseconds (default: 5000)
- `--errors-only`: Only show logs containing errors
- `--user <email>`: Filter to specific user's logs
- `--operation <type>`: Filter by operation type (Apex, Flow, etc.)
- `--no-parse`: Skip log content parsing (faster, less detail)

**Output**: Real-time log display with error/warning highlighting

**Examples**:
```bash
# Basic real-time monitoring
/monitor-logs myorg

# Monitor with 3-second polling
/monitor-logs myorg --interval 3000

# Only show logs with errors
/monitor-logs myorg --errors-only

# Filter by specific user
/monitor-logs myorg --user admin@company.com

# Filter by operation type (Flow, Apex, etc.)
/monitor-logs myorg --operation Flow

# Combine filters
/monitor-logs myorg --user admin@company.com --operation Apex --errors-only
```

**Programmatic Usage**:
```bash
# Start monitoring
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-monitor.js myorg --interval 5000

# Monitor errors only
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-monitor.js myorg --errors-only

# Filter by user
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-monitor.js myorg --user test@example.com
```

**JavaScript API**:
```javascript
const { DebugLogMonitor } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-monitor');

const monitor = new DebugLogMonitor('myorg', {
  pollInterval: 5000,      // Check every 5 seconds
  filterErrors: true,      // Only show errors
  user: 'admin@company.com', // Filter by user
  operation: 'Flow',       // Filter by operation
  parseContent: true       // Parse log content for errors
});

// Listen for events
monitor.on('newLog', ({ log, errors, warnings }) => {
  console.log(`New log: ${log.Id}`);
  console.log(`  Operation: ${log.Operation}`);
  console.log(`  Errors: ${errors.length}`);
});

monitor.on('error', ({ log, error }) => {
  console.error(`ERROR in ${log.Id}:`);
  console.error(`  Type: ${error.type}`);
  console.error(`  Message: ${error.message}`);
});

monitor.on('warning', ({ log, warning }) => {
  console.warn(`WARNING in ${log.Id}:`);
  console.warn(`  Type: ${warning.type}`);
  console.warn(`  Message: ${warning.message}`);
});

// Start monitoring
await monitor.start();

// Stop monitoring (e.g., on Ctrl+C)
process.on('SIGINT', () => {
  monitor.stop();
});
```

**Output Example**:
```
🔍 Debug Log Monitor Started
   Org: myorg
   Poll Interval: 5000ms

   Press Ctrl+C to stop...

✓ [10:15:30] Apex | Success | 45ms | 12.3KB

✓ [10:15:35] Flow | Success | 230ms | 8.5KB

✗ [10:15:40] Apex | Error | 156ms | 25.6KB
  Errors:
    ✗ dml: REQUIRED_FIELD_MISSING - Required field missing: Name
    ✗ exception: System.DmlException

⚠ [10:15:45] Batch | Success | 1500ms | 45.2KB
  Warnings:
    ⚠ heap_warning: 85.3% of limit

^C
📊 Monitor Summary:
   Duration: 120s
   Logs Processed: 15
   Errors Found: 2
   Warnings Found: 1
```

**Detected Error Types**:

| Error Type | Description |
|------------|-------------|
| `exception` | Apex exception thrown |
| `fatal` | Fatal system error |
| `dml` | DML operation failure |
| `null_pointer` | Null pointer exception |
| `query` | SOQL query error |
| `limit` | Governor limit exceeded |
| `validation` | Validation rule error |
| `flow_error` | Flow execution error |

**Detected Warning Types**:

| Warning Type | Description |
|--------------|-------------|
| `heap_warning` | Heap size >80% of limit |
| `cpu_limit` | CPU time approaching limit |
| `recursion` | Trigger recursion detected |

**Integration with Debug Workflow**:
```bash
# 1. Start debug logging
/debug-start myorg --level detailed --duration 60

# 2. Start monitoring in another terminal
/monitor-logs myorg

# 3. Reproduce the issue
# (trigger the automation you're debugging)

# 4. Watch real-time logs for errors

# 5. Stop monitoring (Ctrl+C) and debugging
/debug-stop myorg
```

**Use Cases**:

| Scenario | Command |
|----------|---------|
| Debug Flow issues | `/monitor-logs myorg --operation Flow` |
| Debug Apex triggers | `/monitor-logs myorg --operation Apex` |
| Monitor specific user | `/monitor-logs myorg --user test@company.com` |
| Catch production errors | `/monitor-logs prod --errors-only` |
| High-frequency monitoring | `/monitor-logs myorg --interval 2000` |

**Exit**:
- Press `Ctrl+C` to stop monitoring
- Displays summary statistics on exit

**Troubleshooting**:

| Issue | Cause | Solution |
|-------|-------|----------|
| No logs appearing | No debug activity | Trigger automation, verify trace flag active |
| High latency | Long poll interval | Decrease `--interval` (min ~2000ms) |
| Too many logs | Noisy org | Use `--errors-only` or filter by user |
| Missing errors | Parsing disabled | Remove `--no-parse` flag |

**Related Commands**:
- `/debug-start` - Start debug log capture
- `/debug-stop` - Stop debug logging
- `/apex-logs` - View specific logs
- `/debug-cleanup` - Clean up old logs

**Use the debug-log-monitor script to monitor debug logs in real-time for the {org-alias} Salesforce org. Display new logs as they appear with error and warning detection.**
