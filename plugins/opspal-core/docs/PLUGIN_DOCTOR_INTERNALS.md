# Plugin Doctor - Developer Documentation

**Version**: 1.0.0
**Last Updated**: 2025-11-14

## Architecture Overview

Plugin Doctor is a comprehensive diagnostic system with 6 specialized utility scripts, 1 agent, 1 command, 1 hook, and Supabase integration for tracking infrastructure issues.

### Component Map

```
plugin-doctor system/
├── agents/
│   └── plugin-doctor.md                      # Main diagnostic agent
├── commands/
│   └── plugindr.md                           # CLI command interface
├── hooks/
│   └── post-plugin-update.sh                 # Auto-run after plugin install/update
├── scripts/
│   ├── lib/
│   │   ├── plugin-health-checker.js          # Validate plugins, manifests, agents
│   │   ├── mcp-connectivity-tester.js        # Test MCP server connectivity
│   │   ├── hook-execution-analyzer.js        # Parse hook logs for failures
│   │   ├── claude-log-parser.js              # Extract error patterns
│   │   └── agent-discovery-validator.js      # Validate YAML frontmatter
│   └── migrations/
│       └── add-diagnostic-context.sql        # Supabase schema migration
└── docs/
    ├── PLUGIN_DOCTOR_GUIDE.md                # User documentation
    └── PLUGIN_DOCTOR_INTERNALS.md            # This file
```

## Utility Scripts

### 1. plugin-health-checker.js

**Purpose**: Validates plugin installations, manifests, agents, commands, hooks, and scripts.

**Key Features**:
- Manifest validation (plugin.json schema compliance)
- Agent YAML frontmatter validation
- Hook executable permissions
- Auto-fix capability (remove disallowed fields, chmod +x)

**Usage**:
```bash
node scripts/lib/plugin-health-checker.js [options]

Options:
  --plugin <name>    Check specific plugin
  --verbose          Detailed output
  --fix              Attempt automatic fixes
  --json             JSON output
```

**Exit Codes**:
- `0` - All plugins healthy
- `1` - Warnings detected
- `2` - Critical issues detected

**Auto-Fixable Issues**:
- Disallowed manifest fields (agents, commands)
- Non-executable hooks
- Missing required frontmatter fields

**Example Output**:
```javascript
{
  "timestamp": "2025-11-14T12:00:00Z",
  "healthy": ["salesforce-plugin", "hubspot-plugin"],
  "warnings": [
    {
      "plugin": "opspal-core",
      "message": "Hook not executable",
      "path": "./hooks/pre-reflect.sh",
      "fix": "chmod +x ./hooks/pre-reflect.sh"
    }
  ],
  "errors": [
    {
      "plugin": "developer-tools-plugin",
      "message": "Manifest contains disallowed fields",
      "fields": ["agents"],
      "fix": "jq 'del(.agents)' plugin.json"
    }
  ],
  "fixesApplied": [],
  "summary": {
    "totalHealthy": 2,
    "totalWarnings": 1,
    "totalErrors": 1,
    "passed": false
  }
}
```

---

### 2. mcp-connectivity-tester.js

**Purpose**: Tests connections to all configured MCP servers with latency measurement and authentication validation.

**Supported Servers**:
- Supabase (REST API test)
- Asana (API /users/me endpoint)
- GitHub (API /user endpoint)
- Google Drive (credentials file check)
- HubSpot (crm/v3/objects/contacts)
- n8n (health endpoint)
- Lucid (account info)
- Monday (api/v2 test)
- Salesforce DX (CLI availability check)

**Usage**:
```bash
node scripts/lib/mcp-connectivity-tester.js [options]

Options:
  --server <name>    Test specific server
  --timeout <ms>     Connection timeout (default: 5000)
  --verbose          Detailed output
  --env-file <path>  Load environment variables from a specific file
  --json             JSON output
```

**How It Works**:
1. Reads `.mcp.json` to discover configured servers
2. Detects server type from name/config
3. Makes test API calls with authentication
4. Measures latency
5. Reports status and connectivity issues

**Example Output**:
```javascript
{
  "timestamp": "2025-11-14T12:00:00Z",
  "servers": [
    {
      "name": "supabase",
      "type": "supabase",
      "status": "connected",
      "latency": 300,
      "details": {
        "authenticated": true,
        "endpoint": "https://REDACTED_SUPABASE_PROJECT.supabase.co"
      }
    },
    {
      "name": "asana",
      "type": "asana",
      "status": "authentication_failed",
      "error": "Invalid token",
      "latency": 150
    }
  ],
  "summary": {
    "total": 2,
    "connected": 1,
    "errors": 1,
    "passed": false
  }
}
```

---

### 3. hook-execution-analyzer.js

**Purpose**: Analyzes Claude Code hook execution logs to identify failures, performance bottlenecks, and patterns.

**Data Sources**:
- `~/.claude/logs/hooks/` - Hook-specific logs
- `~/.claude/logs/*.log` - General logs with hook execution

**Checks**:
- Failed hooks (exit code ≠ 0)
- Slow hooks (execution time > threshold, default 100ms)
- Missing hooks that should have executed
- Error patterns (jq not found, permission denied)

**Usage**:
```bash
node scripts/lib/hook-execution-analyzer.js [options]

Options:
  --hours <n>         Analyze last N hours (default: 24)
  --hook <name>       Analyze specific hook
  --threshold <ms>    Slow execution threshold (default: 100)
  --verbose           Show all hook details
  --json              JSON output
```

**Example Output**:
```javascript
{
  "timestamp": "2025-11-14T12:00:00Z",
  "timeframe": "24 hours",
  "summary": {
    "total": 45,
    "successful": 42,
    "failed": 3,
    "slow": 2,
    "passed": false
  },
  "hooks": [
    {
      "name": "pre-reflect.sh",
      "executions": 10,
      "successes": 7,
      "failures": 3,
      "totalDuration": 1500,
      "maxDuration": 250,
      "slowExecutions": 2
    }
  ],
  "failures": [
    {
      "hook": "pre-reflect.sh",
      "error": "jq: command not found",
      "source": "hooks.log",
      "timestamp": "2025-11-14T11:45:00Z"
    }
  ]
}
```

---

### 4. claude-log-parser.js

**Purpose**: Parses Claude Code logs to extract errors, group by type, and identify systemic issues.

**Error Classification**:
- `agent_discovery_failure` - Agents failed to load
- `mcp_connection_failure` - MCP server issues
- `hook_execution_failure` - Hook errors
- `plugin_error` - Plugin manifest/loading issues
- `timeout` - Operation timeouts
- `permission_error` - File access denied
- `file_not_found` - Missing files/directories
- `connection_refused` - Network connectivity

**Usage**:
```bash
node scripts/lib/claude-log-parser.js [options]

Options:
  --hours <n>           Parse last N hours (default: 24)
  --error-type <type>   Filter by error type
  --verbose             Show all error details
  --json                JSON output
```

**Intelligence**:
- Groups errors by type for pattern detection
- Provides fix suggestions for common errors
- Identifies recurring vs isolated issues
- Calculates time since last occurrence

**Example Output**:
```javascript
{
  "timestamp": "2025-11-14T12:00:00Z",
  "timeframe": "24 hours",
  "summary": {
    "totalErrors": 15,
    "totalWarnings": 5,
    "uniqueErrorTypes": 3,
    "passed": false
  },
  "patterns": [
    {
      "type": "hook_execution_failure",
      "count": 12,
      "examples": [
        {
          "message": "jq: command not found",
          "timestamp": "2025-11-14T11:45:00Z",
          "source": "claude.log"
        }
      ],
      "firstSeen": "2025-11-13T08:00:00Z",
      "lastSeen": "2025-11-14T11:45:00Z"
    }
  ]
}
```

---

### 5. agent-discovery-validator.js

**Purpose**: Validates agent discovery, YAML frontmatter, and detects naming conflicts.

**Validation Checks**:
- YAML frontmatter structure
- Required fields (name, description, tools)
- Filename matches agent name
- No duplicate agent names (project vs user scope)
- Tools field format (array vs string)

**Scope Detection**:
- Plugin agents: `.claude-plugins/*/agents/`
- User agents: `~/.claude/agents/`

**Usage**:
```bash
node scripts/lib/agent-discovery-validator.js [options]

Options:
  --plugin <name>    Validate specific plugin
  --verbose          Show all agents
  --fix              Add missing required fields
  --json             JSON output
```

**Auto-Fix Capability**:
- Add missing `description` field
- Add missing `tools` field
- Cannot fix duplicate names (requires user decision)

**Example Output**:
```javascript
{
  "timestamp": "2025-11-14T12:00:00Z",
  "discovered": [
    {
      "name": "plugin-doctor",
      "filename": "plugin-doctor.md",
      "scope": "plugin:opspal-core",
      "path": ".claude-plugins/opspal-core/agents/plugin-doctor.md",
      "fields": {
        "name": "plugin-doctor",
        "description": "Claude Code diagnostics expert",
        "tools": ["Read", "Bash", "Grep"]
      }
    }
  ],
  "failed": [
    {
      "path": ".claude-plugins/opspal-hubspot/agents/custom.md",
      "filename": "custom.md",
      "scope": "plugin:hubspot-plugin",
      "error": "Missing required fields: name, description",
      "fix": "Add fields to YAML frontmatter"
    }
  ],
  "duplicates": [
    {
      "name": "sfdc-custom-validator",
      "locations": [
        {
          "path": ".claude-plugins/opspal-salesforce/agents/sfdc-custom-validator.md",
          "scope": "plugin:salesforce-plugin"
        },
        {
          "path": "~/.claude/agents/sfdc-custom-validator.md",
          "scope": "user-scope"
        }
      ],
      "fix": "Rename one agent or remove from user scope"
    }
  ],
  "summary": {
    "totalDiscovered": 140,
    "totalFailed": 1,
    "totalDuplicates": 1,
    "passed": false
  }
}
```

## Agent Integration

### plugin-doctor Agent

**File**: `agents/plugin-doctor.md`

**Responsibilities**:
1. Orchestrates all 5 utility scripts
2. Aggregates results into unified report
3. Determines infrastructure vs user issues
4. Auto-submits reflections for infrastructure problems

**Workflow**:
```
User runs /plugindr
    ↓
plugin-doctor agent invoked
    ↓
Runs diagnostics:
  1. plugin-health-checker.js
  2. mcp-connectivity-tester.js
  3. hook-execution-analyzer.js
  4. claude-log-parser.js
  5. agent-discovery-validator.js
    ↓
Aggregates results
    ↓
Determines if infrastructure issue
    ↓
If infrastructure issue:
  - Generate reflection JSON
  - Include full diagnostic context
  - Submit via submit-reflection.js
    ↓
Display results to user
```

**Infrastructure Issue Detection**:
```javascript
const isInfrastructureIssue =
  diagnosticResults.plugin_health.errors.length > 0 ||
  diagnosticResults.mcp_status.some(s => s.status !== 'connected') ||
  diagnosticResults.hook_failures.length > 0 ||
  diagnosticResults.agent_discovery.failed > 0 ||
  diagnosticResults.dependencies.some(d => !d.installed && d.required);
```

## Supabase Integration

### Schema Migration

**File**: `scripts/migrations/add-diagnostic-context.sql`

**Changes**:
```sql
-- Add diagnostic_context column (JSONB)
ALTER TABLE reflections
ADD COLUMN diagnostic_context JSONB;

-- Add infrastructure_issue flag (BOOLEAN)
ALTER TABLE reflections
ADD COLUMN infrastructure_issue BOOLEAN DEFAULT FALSE;

-- Index for efficient filtering
CREATE INDEX idx_reflections_infrastructure_issue
ON reflections(infrastructure_issue)
WHERE infrastructure_issue = TRUE;

-- GIN index for JSON querying
CREATE INDEX idx_reflections_diagnostic_context
ON reflections USING GIN (diagnostic_context);
```

**To Apply Migration**:
```bash
# Using psql
psql $DATABASE_URL < scripts/migrations/add-diagnostic-context.sql

# Or via Supabase dashboard SQL editor
# Copy and paste the migration SQL
```

### submit-reflection.js Enhancement

**File**: `../salesforce-plugin/scripts/lib/submit-reflection.js`

**Changes**:
1. Extract `diagnostic_context` from reflection JSON
2. Extract `infrastructure_issue` flag
3. Log infrastructure issue detection
4. Include in Supabase payload

**Payload Structure**:
```javascript
{
  // Standard reflection fields
  "user_email": "user@example.com",
  "org": "production",
  "focus_area": "Infrastructure",
  "outcome": "Infrastructure issue detected",
  "duration_minutes": 5,
  "total_issues": 3,
  "data": { /* full reflection JSON */ },

  // NEW: Diagnostic fields
  "diagnostic_context": {
    "plugin_health": { /* results */ },
    "mcp_status": { /* connectivity */ },
    "recent_errors": [ /* parsed errors */ ],
    "hook_failures": [ /* failed hooks */ ],
    "agent_discovery": { /* status */ },
    "dependencies": { /* missing deps */ },
    "severity": "high",
    "timestamp": "2025-11-14T12:00:00Z"
  },
  "infrastructure_issue": true
}
```

## Hook System

### post-plugin-update Hook

**File**: `hooks/post-plugin-update.sh`

**Trigger**: After `/plugin install` or `/plugin update` commands

**Behavior**:
1. Detect which plugin was updated
2. Run quick health check (plugin-health-checker.js)
3. Display summary to user
4. Exit successfully (never blocks installation)

**Configuration**:
```bash
# Disable hook
export ENABLE_POST_PLUGIN_CHECK=0

# Enable (default)
export ENABLE_POST_PLUGIN_CHECK=1
```

**Example Output**:
```
🔍 Running post-install health check for salesforce-plugin...

✅ Plugin health check passed - no issues found
```

## Development Guidelines

### Adding New Diagnostic Checks

1. **Create utility script** in `scripts/lib/`
2. **Add CLI interface** with `--json`, `--verbose` options
3. **Implement in plugin-doctor agent** (orchestration)
4. **Update tests** (if test suite exists)
5. **Document** in PLUGIN_DOCTOR_GUIDE.md

**Template**:
```javascript
#!/usr/bin/env node

class MyDiagnostic {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.results = { passed: true, issues: [] };
  }

  async check() {
    console.log('🔍 Running my diagnostic...\n');
    // Perform checks
    return this.generateSummary();
  }

  generateSummary() {
    // Format results
    return {
      passed: this.results.passed,
      issues: this.results.issues
    };
  }

  getJSONReport() {
    return {
      timestamp: new Date().toISOString(),
      ...this.results
    };
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const diagnostic = new MyDiagnostic({
    verbose: args.includes('--verbose'),
    json: args.includes('--json')
  });

  diagnostic.check().then(result => {
    if (args.includes('--json')) {
      console.log(JSON.stringify(diagnostic.getJSONReport(), null, 2));
    }
    process.exit(result.passed ? 0 : 1);
  });
}

module.exports = MyDiagnostic;
```

### Testing

**Manual Testing**:
```bash
# Test individual utilities
node scripts/lib/plugin-health-checker.js --verbose
node scripts/lib/mcp-connectivity-tester.js --verbose

# Test full system
/plugindr --verbose

# Test auto-fix
/plugindr --fix

# Test JSON output
/plugindr --json | jq .
```

**Testing Infrastructure Reflection**:
```bash
# Create a plugin with invalid manifest
echo '{"agents": []}' > .claude-plugins/test/.claude-plugin/plugin.json

# Run diagnostic (should detect and auto-submit)
/plugindr

# Verify submission
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js \
  --filter "infrastructure_issue=true" --limit 1
```

## Performance Considerations

**Target Performance**:
- Quick check: < 2 seconds
- Full diagnostic: < 5 seconds
- Targeted diagnostic: < 3 seconds

**Optimization Strategies**:
1. **Parallel Execution**: Run independent checks concurrently
2. **Caching**: Cache plugin health for 5 minutes
3. **Early Exit**: Stop on first critical issue (optional)
4. **Lazy Loading**: Only load utilities when needed

**Bottlenecks**:
- Hook log parsing (large log files)
- MCP connectivity tests (network latency)
- Agent file reading (many agents)

## Future Enhancements

**Planned Features**:
- [ ] Performance benchmarking mode
- [ ] Historical trend analysis (track degradation over time)
- [ ] Automatic repair mode (beyond --fix)
- [ ] Integration with CI/CD pipelines
- [ ] Scheduled health checks (daily/weekly)
- [ ] Slack/email notifications for critical issues
- [ ] Machine learning for pattern detection

**Extensibility**:
- Plugin-specific diagnostic extensions
- Custom validation rules
- Third-party MCP server support

## Troubleshooting Development Issues

### Script Permissions

```bash
# Ensure all scripts are executable
find scripts/lib -name "*.js" -exec chmod +x {} \;
find hooks -name "*.sh" -exec chmod +x {} \;
```

### Module Not Found Errors

```bash
# Verify relative paths in require statements
# Use __dirname for path resolution

const path = require('path');
const utilPath = path.join(__dirname, 'utility-script.js');
const util = require(utilPath);
```

### JSON Parsing Errors

```bash
# Validate JSON output before using jq
node script.js --json > output.json
cat output.json | jq empty  # Returns error if invalid
```

## Related Documentation

- **User Guide**: `PLUGIN_DOCTOR_GUIDE.md`
- **Command Docs**: `/plugindr` command definition
- **Agent Docs**: `agents/plugin-doctor.md`
- **Supabase Schema**: `scripts/migrations/add-diagnostic-context.sql`

## Support

- **Development Issues**: GitHub Issues
- **Feature Requests**: Use `/reflect` with focus area "Infrastructure"
- **Questions**: See FAQ in PLUGIN_DOCTOR_GUIDE.md

---

**Last Updated**: 2025-11-14
**Version**: 1.0.0
**Maintained By**: Plugin Doctor System
