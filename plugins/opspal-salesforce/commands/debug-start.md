---
description: Start debug log capture for a Salesforce org with configurable presets
argument-hint: "myorg"
---

Start capturing debug logs for a Salesforce org by creating TraceFlags and DebugLevels via the Tooling API.

This command will:
- **Resolve the target user** (current user, specified user, or Automated Process)
- **Create/verify a DebugLevel** with appropriate log category settings
- **Create a TraceFlag** with specified duration (default 30 minutes, max 480)
- **Report the expiration time** so you know when to retrieve logs

**Target Org**: {org-alias} (required)

**Options** (optional flags):
- `--user <email>`: Username to trace (default: current authenticated user)
- `--duration <minutes>`: How long to capture logs (default: 30, max: 480)
- `--level <preset>`: Log level preset - `quick`, `standard`, `detailed`, `flow`, `apex`

**Presets**:
| Preset | ApexCode | Database | Workflow | Use Case |
|--------|----------|----------|----------|----------|
| `quick` | INFO | NONE | INFO | Fast, minimal logs |
| `standard` | DEBUG | INFO | INFO | Balanced (default) |
| `detailed` | FINE | FINEST | FINEST | Maximum detail |
| `flow` | INFO | INFO | FINEST | Flow debugging |
| `apex` | FINEST | DEBUG | INFO | Apex debugging |

**Output**: Confirmation with trace flag ID and expiration time

**Examples**:
```bash
# Start debug logging for current user (30 min, standard preset)
/debug-start myorg

# Start with detailed logging for 60 minutes
/debug-start myorg --level detailed --duration 60

# Trace a specific user
/debug-start myorg --user admin@company.com --duration 30

# Trace Automated Process user (for Flow debugging)
/debug-start myorg --user "Automated Process" --level flow

# Quick preset for minimal overhead
/debug-start myorg --level quick --duration 15
```

**Programmatic Usage**:
```bash
# Direct script invocation
node scripts/lib/debug-log-manager.js start myorg standard 30

# With verbose output
VERBOSE=1 node scripts/lib/debug-log-manager.js start myorg detailed 60
```

**JavaScript API**:
```javascript
const { DebugLogManager } = require('./scripts/lib/debug-log-manager');

const manager = new DebugLogManager('myorg', { verbose: true });
const result = await manager.startDebugLogging({
  preset: 'standard',
  duration: 30,
  user: 'admin@company.com' // optional
});

console.log(`Trace expires: ${result.expiresAt}`);
```

**What Gets Configured**:

1. **Debug Level** (~2 seconds)
   - Creates `OpsPal_<preset>_Level` if not exists
   - Configures log categories per preset
   - Reuses existing debug level if available

2. **Trace Flag** (~2 seconds)
   - Links user to debug level
   - Sets `USER_DEBUG` log type
   - Configures expiration based on duration

**Post-Start Actions**:
```bash
# Reproduce the issue or trigger the automation you want to debug
# Then retrieve the logs:

# View recent logs
/apex-logs myorg --latest

# View with errors highlighted
/apex-logs myorg --errors-only

# When done, stop and cleanup
/debug-stop myorg
```

**Important Notes**:

- **Storage Limits**: Debug logs are capped at 20 MB each, 1 GB total per org
- **Retention**: System logs auto-delete after ~24 hours, user logs after ~7 days
- **Performance**: Extensive logging (detailed preset) can impact performance
- **Sandbox vs Production**: Use shorter durations in production

**Exit Codes**:
- `0` - Debug logging started successfully
- `1` - Failed to start (check error message)
- `2` - Invalid preset or duration

**Troubleshooting**:

| Error | Cause | Solution |
|-------|-------|----------|
| `User not found` | Invalid username | Verify email with `sf org display` |
| `Insufficient access` | Missing permissions | Need "Modify All Data" or "Author Apex" |
| `Maximum trace flags exceeded` | Org limit reached | Run `/debug-cleanup myorg` first |

**Related Commands**:
- `/apex-logs` - Retrieve and analyze debug logs
- `/debug-stop` - Stop debug logging and cleanup
- `/debug-cleanup` - Clean up expired trace flags
- `/monitor-logs` - Real-time log monitoring

**Use the debug-log-manager script to start debug logging on the {org-alias} Salesforce org. Create a TraceFlag with the specified preset and duration, and report the expiration time.**
