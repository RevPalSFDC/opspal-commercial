---
name: plugindr
description: Run comprehensive plugin system diagnostics and health checks
stage: stable
---

# Plugin Doctor - System Health Diagnostics

This command runs comprehensive diagnostics on the plugin system to identify and resolve issues with plugins, MCP servers, hooks, agents, and dependencies.

## What This Command Does

The plugin doctor performs a full health check including:

1. **Plugin Health** - Validates all installed plugins
2. **MCP Connectivity** - Tests connections to configured MCP servers
3. **Hook Execution** - Analyzes hook execution logs for failures
4. **Agent Discovery** - Validates all agents are properly loaded
5. **Dependencies** - Checks for required system utilities
6. **Recent Errors** - Parses Claude Code logs for error patterns

## Diagnostic Checks

### Plugin Health
- Manifest validation (plugin.json)
- Agent files with valid YAML frontmatter
- Command and hook files present
- Script dependencies available
- No duplicate agent names

### MCP Connectivity
- Supabase connection and authentication
- Asana API access
- GitHub integration (if configured)
- Google Drive (if configured)
- Latency measurements

### Hook Execution Analysis
- Recent hook execution logs (last 24 hours)
- Failed hook detection
- Performance bottlenecks (slow hooks)
- Missing hook dependencies (e.g., jq)

### Agent Discovery Validation
- All agents properly discovered
- Valid YAML frontmatter structure
- No naming conflicts
- Required fields present (name, description, tools)

### Dependency Checking
- Node.js (>= 16.0.0)
- SF CLI (for Salesforce plugins)
- jq (JSON processor)
- git (version control)

### Error Log Analysis
- Recent errors from ~/.claude/logs
- Error pattern grouping
- Frequency analysis
- Fix suggestions

## Usage

### Basic Diagnostics
```bash
/plugindr
```
Runs all checks with summary output (< 5 seconds).

### Detailed Output
```bash
/plugindr --verbose
```
Shows detailed results for all checks.

### Quick Check
```bash
/plugindr --quick
```
Fast validation of plugins and MCP (< 2 seconds).

### Check Specific Plugin
```bash
/plugindr --plugin salesforce-plugin
```
Validates only the specified plugin.

### MCP Connectivity Only
```bash
/plugindr --mcp
```
Tests only MCP server connections.

### Hook Analysis Only
```bash
/plugindr --hooks
```
Analyzes hook execution logs only.

### Agent Discovery Only
```bash
/plugindr --agents
```
Validates agent discovery only.

### Attempt Auto-Fixes
```bash
/plugindr --fix
```
Automatically fixes common issues where possible:
- Remove disallowed fields from manifests
- Make hooks executable (chmod +x)
- Add missing required fields to agent frontmatter

### JSON Output
```bash
/plugindr --json
```
Outputs diagnostic results in JSON format for scripting.

## Output Format

### Summary Mode (Default)
```
╔════════════════════════════════════════════════════════╗
║     Plugin System Health Diagnostic                    ║
╚════════════════════════════════════════════════════════╝

📦 Plugin Health: 2 issues ▸ [expand for details]
🔌 MCP Status: All connected ✓
⚙️ Hook Execution: 1 warning ▸ [expand]
📚 Dependencies: 1 missing ▸ [expand]

╔════════════════════════════════════════════════════════╗
║  Overall Status: DEGRADED ⚠️                           ║
║  Issues Found: 2 critical, 1 warning                   ║
║  Action Required: Install jq, fix developer-tools      ║
╚════════════════════════════════════════════════════════╝
```

### Detailed Mode (--verbose)
Shows full details for each check with:
- Complete error messages
- File paths and line numbers
- Specific fix commands
- Performance metrics
- Recommendations

## Status Levels

- ✅ **HEALTHY** - All checks passed, no issues
- ⚠️ **DEGRADED** - Warnings detected, system functional
- ❌ **CRITICAL** - Critical issues, system may be unstable

## Common Issues and Fixes

### Issue: Plugin manifest invalid
```
Error: "agents" field not allowed in plugin.json
Fix: jq 'del(.agents)' plugin.json > tmp.json && mv tmp.json plugin.json
```

### Issue: Missing jq dependency
```
Error: jq command not found
Fix: brew install jq (macOS) or apt-get install jq (Linux)
```

### Issue: Hook not executable
```
Error: pre-reflect.sh permission denied
Fix: chmod +x .claude-plugins/*/hooks/pre-reflect.sh
```

### Issue: Agent missing required fields
```
Error: Agent missing 'name' field in YAML frontmatter
Fix: Add 'name: agent-name' to frontmatter
```

### Issue: MCP connection failed
```
Error: Supabase connection refused
Fix: Verify SUPABASE_URL and SUPABASE_ANON_KEY in .env
```

### Issue: Duplicate agent names
```
Error: Agent 'sfdc-custom-validator' defined in multiple locations
Fix: Rename one agent or remove from user scope (~/.claude/agents/)
```

## Infrastructure Issue Detection

When `/plugindr` detects infrastructure issues (problems with the plugin system itself, not user code), it:

1. **Automatically generates** a comprehensive diagnostic report
2. **Auto-submits a reflection** with complete diagnostic context
3. **Tags the reflection** as `infrastructure_issue: true`
4. **Includes all diagnostic data**: logs, error messages, fix attempts

This ensures infrastructure problems are tracked, prioritized, and resolved quickly.

### Infrastructure Issues (Auto-Reflection)
- Invalid plugin manifests
- Missing dependencies (jq, node, sf CLI)
- MCP server connection failures
- Hook execution errors
- Agent discovery failures
- File permission issues

### User Issues (No Auto-Reflection)
- User code errors
- Query syntax mistakes
- Data validation failures
- Business logic errors

## When to Run

### Recommended Times
- ✅ After plugin installation - Verify successful installation
- ✅ After plugin updates - Check for breaking changes
- ✅ When errors occur - Identify root cause
- ✅ Before submitting reflections - Include diagnostic context
- ✅ Weekly maintenance - Proactive health monitoring

### Automatic Triggers
- Post-plugin-update hook runs quick check automatically
- Infrastructure errors trigger auto-diagnostics

## Performance

- **Quick check**: < 2 seconds (manifest validation only)
- **Full diagnostic**: < 5 seconds (all checks)
- **Targeted diagnostic**: < 3 seconds (specific category)

## Examples

### Example 1: Post-Installation Check
```bash
# After installing a new plugin
/plugin install salesforce-plugin@revpal-internal-plugins

# Verify installation
/plugindr --quick

# Expected output:
# ✓ salesforce-plugin installed successfully
# ✓ 51 agents discovered
# ✓ All dependencies present
# ✓ MCP connectivity OK
```

### Example 2: Debugging Failed Reflection
```bash
# User reports: "My reflection didn't submit"
/plugindr --mcp

# Identifies:
# ✗ Supabase MCP connection failed
# Error: Invalid authentication token
# Fix: Verify SUPABASE_ANON_KEY in .env
```

### Example 3: Weekly Health Check
```bash
# Proactive maintenance
/plugindr --verbose

# Reviews:
# - All plugins healthy
# - MCP connections stable
# - Hook execution normal
# - No recent errors
```

### Example 4: Fixing Issues Automatically
```bash
# Run diagnostics with auto-fix
/plugindr --fix

# Applies fixes:
# 🔧 Removed disallowed fields from developer-tools manifest
# 🔧 Made pre-reflect.sh executable
# 🔧 Added missing 'description' field to agent frontmatter
```

## Related Commands

- `/routing-health` - Check automatic agent routing system
- `/checkdependencies` - Check project-specific dependencies
- `/agents` - List all discovered agents
- `/plugin list` - List installed plugins

## Troubleshooting

### Command Not Found
```bash
# Verify plugin is installed
/plugin list

# Reinstall if needed
/plugin install cross-platform-plugin@revpal-internal-plugins
```

### Diagnostics Fail to Run
```bash
# Check if plugin-doctor agent is loaded
/agents | grep plugin-doctor

# Run with verbose output for debugging
/plugindr --verbose
```

### False Positives
If diagnostics report issues that don't exist:
1. Check if using latest plugin version
2. Restart Claude Code
3. Run diagnostics with `--verbose` for details
4. Submit feedback with `/reflect`

## Advanced Usage

### Scripting with JSON Output
```bash
# Get JSON output for CI/CD
/plugindr --json > diagnostic-report.json

# Parse results
cat diagnostic-report.json | jq '.summary.passed'
```

### Filtering Results
```bash
# Check only specific aspects
/plugindr --mcp --json | jq '.servers[] | select(.status=="error")'
```

### Monitoring Infrastructure Health
```bash
# Daily health check (add to cron/scheduled task)
/plugindr --quick || echo "Infrastructure issues detected"
```

## Support

- **Issues**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Feedback**: Use `/reflect` to submit feedback on plugin-doctor
- **Documentation**: `.claude-plugins/cross-platform-plugin/docs/PLUGIN_DOCTOR_GUIDE.md`

---

**Version**: 1.0.0
**Last Updated**: 2025-11-14
**Agent**: plugin-doctor
