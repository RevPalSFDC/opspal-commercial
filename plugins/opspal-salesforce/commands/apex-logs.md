---
description: View and retrieve Salesforce debug logs with filtering and analysis options
argument-hint: "myorg"
---

Retrieve and analyze debug logs from a Salesforce org via the Tooling API.

This command will:
- **Query recent debug logs** from the ApexLog object
- **Display log metadata** (ID, time, operation, status, size)
- **Retrieve log body content** for detailed analysis
- **Filter by user, operation, or errors**
- **Save logs to file** for offline analysis

**Target Org**: {org-alias} (required)

**Options** (optional flags):
- `--latest`: Get only the most recent log (default behavior)
- `--limit <n>`: Number of logs to retrieve (1-100, default: 10)
- `--user <email>`: Filter to specific user's logs
- `--errors-only`: Show only logs containing errors
- `--log-id <id>`: Get a specific log by ID
- `--save <path>`: Save log body to file
- `--json`: Output as JSON for scripting

**Output Formats**:
- **Summary** (default): Table with log metadata
- **Detail**: Full log body content
- **JSON**: Structured output for scripting

**Examples**:
```bash
# View most recent log (summary)
/apex-logs myorg

# View last 5 logs
/apex-logs myorg --limit 5

# Get specific log content
/apex-logs myorg --log-id 07Lxx000000XXXX

# Filter to errors only
/apex-logs myorg --errors-only

# Filter by user
/apex-logs myorg --user admin@company.com --limit 10

# Save log to file
/apex-logs myorg --log-id 07Lxx000000XXXX --save ./logs/debug.log

# JSON output for scripting
/apex-logs myorg --limit 5 --json
```

**Programmatic Usage**:
```bash
# List recent logs
node scripts/lib/debug-log-manager.js logs myorg --limit 5

# Get log body
node scripts/lib/debug-log-manager.js body myorg 07Lxx000000XXXX

# Check storage usage
node scripts/lib/debug-log-manager.js storage myorg
```

**JavaScript API**:
```javascript
const { DebugLogManager } = require('./scripts/lib/debug-log-manager');

const manager = new DebugLogManager('myorg', { verbose: true });

// Get recent logs
const logs = await manager.getRecentLogs({ limit: 10 });

// Get log body
const body = await manager.getLogBody('07Lxx000000XXXX');

// Get storage usage
const usage = await manager.getStorageUsage();
```

**Log Summary Output**:
```
Recent Debug Logs (5):
  ID                 | Time                    | Operation | Status  | Size
  07Lxx000000XXXX    | 2025-11-27 09:15:30    | API       | Success | 45.2KB
  07Lxx000000YYYY    | 2025-11-27 09:14:22    | Flow      | Success | 12.8KB
  07Lxx000000ZZZZ    | 2025-11-27 09:13:15    | Trigger   | Error   | 8.3KB
```

**Error Detection**:

When using `--errors-only`, the command scans for:
- `EXCEPTION_THROWN` - Apex exceptions
- `FLOW_ELEMENT_ERROR` - Flow errors
- `VALIDATION_ERROR` - Validation rule failures
- `FATAL_ERROR` - Critical system errors
- `HEAP_ALLOCATE` warnings (near limits)

**Log Body Analysis**:

The log body contains execution details including:
- **Apex Execution**: METHOD_ENTRY, METHOD_EXIT, USER_DEBUG
- **SOQL Queries**: SOQL_EXECUTE_BEGIN, SOQL_EXECUTE_END, row counts
- **DML Operations**: DML_BEGIN, DML_END, operation type
- **Flow Execution**: FLOW_START, FLOW_ELEMENT, FLOW_DECISION
- **Governor Limits**: LIMIT_USAGE_FOR_NS, cumulative usage
- **Errors**: EXCEPTION_THROWN with stack traces

**Typical Workflow**:
```bash
# 1. Start debug logging
/debug-start myorg --level detailed

# 2. Reproduce the issue
# (trigger the Flow, Apex, or automation you're debugging)

# 3. View logs
/apex-logs myorg --latest

# 4. Get detailed log content
/apex-logs myorg --log-id 07Lxx000000XXXX

# 5. Save for analysis
/apex-logs myorg --log-id 07Lxx000000XXXX --save ./debug.log

# 6. Stop logging
/debug-stop myorg
```

**Exit Codes**:
- `0` - Logs retrieved successfully
- `1` - Failed to retrieve logs
- `2` - Log not found (invalid ID)

**Storage Information**:
```bash
# Check debug log storage usage
node scripts/lib/debug-log-manager.js storage myorg

# Output:
# Debug Log Storage:
#   Total Logs: 142
#   Total Size: 45.2 MB
#   Limit: 1000 MB
#   Usage: 4.5%
```

**Important Notes**:

- **Max Log Size**: Individual logs capped at 20 MB
- **Truncation**: Large logs may be truncated with "MAXIMUM DEBUG LOG SIZE REACHED"
- **Retention**: Logs auto-delete after 24 hours (system) or 7 days (user)
- **Performance**: Retrieving large log bodies may take several seconds

**Troubleshooting**:

| Error | Cause | Solution |
|-------|-------|----------|
| `No logs found` | No debug activity | Ensure trace flag is active, then trigger action |
| `Log not found` | Invalid log ID or expired | Check ID, logs may have been auto-deleted |
| `Body retrieval failed` | Large log or timeout | Try with shorter log, increase timeout |

**Related Commands**:
- `/debug-start` - Start debug log capture
- `/debug-stop` - Stop debug logging and cleanup
- `/monitor-logs` - Real-time log monitoring
- `/debug-cleanup` - Clean up old logs

**Integration with Agents**:
- `flow-log-analyst` - Detailed Flow log parsing and analysis
- `apex-debug-analyst` - Apex execution analysis and optimization

**Use the debug-log-manager script to retrieve debug logs from the {org-alias} Salesforce org. Display log metadata and optionally retrieve full log content for analysis.**
