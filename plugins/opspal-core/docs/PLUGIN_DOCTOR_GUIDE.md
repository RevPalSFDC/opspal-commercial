# Plugin Doctor - User Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-14
**Command**: `/plugindr`

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [When to Use](#when-to-use)
- [Command Reference](#command-reference)
- [Understanding Results](#understanding-results)
- [Common Issues & Fixes](#common-issues--fixes)
- [Auto-Reflection System](#auto-reflection-system)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Overview

Plugin Doctor (`/plugindr`) is an intelligent diagnostic system that automatically detects and helps resolve issues with your Claude Code plugin installation. It performs comprehensive health checks on:

- **Plugin Health** - Validates all installed plugins
- **MCP Connectivity** - Tests connections to Supabase, Asana, GitHub
- **Hook Execution** - Analyzes hook logs for failures
- **Agent Discovery** - Ensures all agents are properly loaded
- **Dependencies** - Checks for required system utilities
- **Error Logs** - Parses recent errors and suggests fixes

### Key Features

✅ **Automatic Error Detection** - Finds issues before they cause problems
✅ **Intelligent Fix Suggestions** - Provides exact commands to resolve issues
✅ **Auto-Reflection** - Automatically reports infrastructure problems
✅ **Quick Mode** - Fast validation in < 2 seconds
✅ **Post-Install Checks** - Automatically runs after plugin updates

## Quick Start

### Run Basic Diagnostic

```bash
/plugindr
```

This runs a full health check and displays results in summary format (< 5 seconds).

### Run with Verbose Output

```bash
/plugindr --verbose
```

Shows detailed results for all checks including file paths, error messages, and specific recommendations.

### Quick Health Check

```bash
/plugindr --quick
```

Fast validation of plugins and MCP connectivity (< 2 seconds).

## When to Use

### Recommended Times

✅ **After Plugin Installation**
```bash
/plugin install opspal-salesforce@revpal-internal-plugins
/plugindr --quick
```

✅ **After Plugin Updates**
```bash
/plugin update
/plugindr
```

✅ **When Errors Occur**
```bash
# If you see agent not found, hook failures, or MCP errors
/plugindr
```

✅ **Before Submitting Reflections**
```bash
# Include diagnostic context
/plugindr
/reflect
```

✅ **Weekly Maintenance**
```bash
# Proactive monitoring
/plugindr --verbose
```

### Automatic Triggers

Plugin Doctor runs automatically:
- After plugin installations (via post-plugin-update hook)
- When infrastructure errors occur (auto-diagnostic)

## Command Reference

### Basic Commands

| Command | Description | Speed |
|---------|-------------|-------|
| `/plugindr` | Full diagnostic (default) | ~5s |
| `/plugindr --verbose` | Detailed output | ~5s |
| `/plugindr --quick` | Fast validation | ~2s |
| `/plugindr --json` | JSON format for scripting | ~5s |
| `/plugindr --fix` | Attempt automatic fixes | ~10s |

### Targeted Diagnostics

| Command | What It Checks |
|---------|----------------|
| `/plugindr --plugin salesforce-plugin` | Specific plugin only |
| `/plugindr --mcp` | MCP connectivity only |
| `/plugindr --hooks` | Hook execution logs only |
| `/plugindr --agents` | Agent discovery only |

### Examples

```bash
# Check specific plugin after update
/plugindr --plugin hubspot-plugin

# Test MCP connections
/plugindr --mcp

# Analyze recent hook failures
/plugindr --hooks

# Attempt automatic fixes
/plugindr --fix

# Get JSON output for parsing
/plugindr --json > diagnostic-report.json
```

## Understanding Results

### Output Format

#### Summary Mode (Default)

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

#### Detailed Mode (`--verbose`)

Shows complete information:
- Full error messages and stack traces
- Exact file paths and line numbers
- Specific fix commands (copy-paste ready)
- Performance metrics for slow hooks
- Recommendations for each issue

### Status Levels

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ | **HEALTHY** | All checks passed, no issues found |
| ⚠️ | **DEGRADED** | Warnings detected, system functional but needs attention |
| ❌ | **CRITICAL** | Critical issues found, system may be unstable |

### Priority Classification

| Priority | Action Required | Examples |
|----------|----------------|----------|
| **Critical** | Immediate fix required | System broken, plugins not loading |
| **High** | Fix soon | Degraded performance, missing features |
| **Medium** | Recommended fix | Potential future issues |
| **Low** | Informational | Best practices, optimization suggestions |

## Common Issues & Fixes

### 1. Invalid Plugin Manifest

**Symptom:**
```
✗ developer-tools-plugin - MANIFEST INVALID
  Issue: "agents" field not allowed in plugin.json
```

**Fix:**
```bash
cd .claude-plugins/developer-tools-plugin
jq 'del(.agents)' .claude-plugin/plugin.json > tmp.json && mv tmp.json .claude-plugin/plugin.json
```

**Or use auto-fix:**
```bash
/plugindr --fix
```

---

### 2. Missing jq Dependency

**Symptom:**
```
✗ jq - NOT INSTALLED
  Required for: Hook execution, JSON processing
```

**Fix:**

**macOS:**
```bash
brew install jq
```

**Linux:**
```bash
sudo apt-get install jq
```

**Windows:**
```bash
choco install jq
```

**Verify:**
```bash
jq --version
```

---

### 3. Hook Not Executable

**Symptom:**
```
⚠️ Hook pre-reflect.sh not executable
  Fix: chmod +x /path/to/hook
```

**Fix:**
```bash
chmod +x .claude-plugins/*/hooks/pre-reflect.sh
```

**Or use auto-fix:**
```bash
/plugindr --fix
```

---

### 4. Agent Missing Required Fields

**Symptom:**
```
✗ hubspot-workflow-orchestrator - Missing required fields: name
  Fix: Add 'name: hubspot-workflow-orchestrator' to frontmatter
```

**Fix:**

Edit the agent file `.claude-plugins/opspal-hubspot/agents/hubspot-workflow-orchestrator.md`:

```yaml
---
name: hubspot-workflow-orchestrator
description: Orchestrates HubSpot workflow operations
tools: Read, Write, mcp__hubspot__*
---
```

---

### 5. MCP Connection Failed

**Symptom:**
```
✗ Supabase - CONNECTION FAILED
  Error: Invalid authentication token
```

**Fix:**

1. Check environment variables:
```bash
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
```

2. If missing, add to `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

3. Test manually:
```bash
curl -X GET "$SUPABASE_URL/rest/v1/reflections?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

---

### 6. Duplicate Agent Names

**Symptom:**
```
⚠️ Agent 'sfdc-custom-validator' defined in multiple locations
  Location 1: .claude-plugins/opspal-salesforce/agents/
  Location 2: ~/.claude/agents/
```

**Fix:**

Either rename one agent or remove from user scope:

```bash
# Option 1: Rename user-scope agent
mv ~/.claude/agents/sfdc-custom-validator.md ~/.claude/agents/my-custom-validator.md

# Option 2: Remove user-scope agent
rm ~/.claude/agents/sfdc-custom-validator.md
```

## Auto-Reflection System

### What is Auto-Reflection?

When Plugin Doctor detects **infrastructure issues** (problems with the plugin system itself), it automatically:

1. **Generates** a comprehensive diagnostic report
2. **Submits** a reflection with full diagnostic context
3. **Tags** the reflection as `infrastructure_issue: true`
4. **Includes** all diagnostic data (logs, errors, fix attempts)

This ensures infrastructure problems are tracked, prioritized, and resolved quickly.

### Infrastructure vs User Issues

**Infrastructure Issues** (Auto-Reflection Triggered):
- ❌ Invalid plugin manifests
- ❌ Missing dependencies (jq, node, sf CLI)
- ❌ MCP server connection failures
- ❌ Hook execution errors
- ❌ Agent discovery failures
- ❌ File permission issues

**User Issues** (No Auto-Reflection):
- ✅ User code errors
- ✅ Query syntax mistakes
- ✅ Data validation failures
- ✅ Business logic errors

### What Gets Stored

The auto-submitted reflection includes:

```json
{
  "infrastructure_issue": true,
  "diagnostic_context": {
    "plugin_health": { "status": "ERROR", "details": "..." },
    "mcp_status": { "supabase": "failed", "latency_ms": 5000 },
    "recent_errors": [ "jq: command not found" ],
    "hook_failures": [ "pre-reflect.sh" ],
    "agent_discovery": { "loaded": 140, "failed": 6 },
    "dependencies": { "jq": { "installed": false } },
    "severity": "high",
    "timestamp": "2025-11-14T12:00:00Z"
  }
}
```

### Viewing Auto-Reflections

Infrastructure reflections are tracked in Supabase and can be queried:

```bash
# View recent infrastructure issues
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js \
  --filter "infrastructure_issue=true" \
  --limit 10
```

## Advanced Usage

### Scripting with JSON Output

```bash
# Run diagnostic and save results
/plugindr --json > /tmp/diagnostic.json

# Check if passed
cat /tmp/diagnostic.json | jq '.summary.passed'

# Count errors
cat /tmp/diagnostic.json | jq '.summary.totalErrors'

# List failed plugins
cat /tmp/diagnostic.json | jq '.errors[].plugin' | sort -u
```

### Monitoring in CI/CD

```bash
#!/bin/bash

# Run health check
/plugindr --json > diagnostic.json

# Parse results
PASSED=$(jq '.summary.passed' diagnostic.json)
ERRORS=$(jq '.summary.totalErrors' diagnostic.json)

if [ "$PASSED" = "false" ]; then
  echo "❌ Plugin health check failed with $ERRORS errors"
  jq '.errors[]' diagnostic.json
  exit 1
fi

echo "✅ Plugin health check passed"
```

### Filtering Results

```bash
# Check only MCP issues
/plugindr --mcp --json | jq '.servers[] | select(.status=="error")'

# Check specific plugin
/plugindr --plugin salesforce-plugin --json | jq '.healthy[]'

# Get hook failures
/plugindr --hooks --json | jq '.failures[]'
```

## Troubleshooting

### Problem: `/plugindr` Command Not Found

**Cause**: opspal-core not installed or not loaded

**Fix**:
```bash
# Check if plugin is installed
/plugin list

# Reinstall if needed
/plugin install opspal-core@revpal-internal-plugins

# Verify installation
/agents | grep plugin-doctor
```

---

### Problem: Diagnostics Fail to Run

**Cause**: Missing Node.js or script permissions

**Fix**:
```bash
# Check Node.js
node --version  # Should be >= 16.0.0

# Check script exists
ls -la .claude-plugins/opspal-core/scripts/lib/plugin-health-checker.js

# Run with verbose for debugging
/plugindr --verbose
```

---

### Problem: False Positives

**Cause**: Outdated plugin version or stale cache

**Fix**:
```bash
# Update plugins
/plugin update

# Restart Claude Code
# Exit and reopen the application

# Run diagnostics again
/plugindr --verbose
```

---

### Problem: Auto-Reflection Not Submitting

**Cause**: Supabase not configured or network issues

**Fix**:
```bash
# Check Supabase configuration
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Test connection
/plugindr --mcp

# Check network
curl -I https://REDACTED_SUPABASE_PROJECT_REF.supabase.co
```

## FAQ

### Q: How often should I run `/plugindr`?

**A**: Run after plugin updates, when errors occur, and weekly for proactive monitoring. It also runs automatically after plugin installations.

---

### Q: Does `/plugindr` make any changes to my system?

**A**: By default, no. Use `--fix` flag to attempt automatic fixes (making hooks executable, removing disallowed manifest fields).

---

### Q: What if I don't want auto-reflections for infrastructure issues?

**A**: You can disable auto-reflection (though not recommended):

```bash
export ENABLE_INFRASTRUCTURE_REFLECTION=0
```

---

### Q: Can I run diagnostics for plugins I'm developing?

**A**: Yes! Use `--plugin` flag:

```bash
cd /path/to/my-plugin
/plugindr --plugin my-plugin
```

---

### Q: How do I disable the post-plugin-update hook?

**A**: Set environment variable:

```bash
export ENABLE_POST_PLUGIN_CHECK=0
```

---

### Q: What's the difference between `/plugindr` and `/routing-health`?

**A**:
- `/plugindr` - Comprehensive plugin system diagnostics (plugins, MCP, hooks, agents, dependencies)
- `/routing-health` - Specific to automatic agent routing system health

---

### Q: Where are diagnostic logs stored?

**A**: Diagnostics are not logged by default. Use `--json` to save results:

```bash
/plugindr --json > ~/.claude/diagnostics/$(date +%Y%m%d-%H%M%S).json
```

---

### Q: Can I contribute fixes to Plugin Doctor?

**A**: Yes! Use `/reflect` to submit feedback on Plugin Doctor. Infrastructure issues are automatically tracked.

## Support

- **Issues**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Feedback**: Use `/reflect` with focus area "Infrastructure"
- **Developer Docs**: See `PLUGIN_DOCTOR_INTERNALS.md`
- **Command Docs**: See `/plugindr` command documentation

---

**Last Updated**: 2025-11-14
**Version**: 1.0.0
**Maintained By**: Plugin Doctor System
