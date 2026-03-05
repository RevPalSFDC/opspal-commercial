# Agent Failure Debugging Playbook

## Overview

Use this playbook when specialized agents (SFDC, HubSpot, GTM, etc.) fail to execute properly or return unexpected results.

## Symptoms

- Agent invocation errors or timeouts
- Unexpected agent behavior or wrong agent selection
- Task tool failures with agent routing issues
- Missing or incomplete agent output
- Agent loops or infinite retries

## Diagnostic Steps

### Step 1: Check Agent Invocation Traces

```bash
# View recent agent invocations
node scripts/lib/debugging-context-extractor.js extract --window=60 | jq '.debugging_context.span_summary'

# Look for agent-invocation spans
grep '"name":"agent-invocation"' ~/.claude/logs/traces.jsonl | tail -10
```

**What to look for:**
- Agent name and task description
- Span duration and status
- Error messages or exceptions

### Step 2: Verify Agent Availability

```bash
# List available agents in current context
ls -la .claude-plugins/*/agents/*.md 2>/dev/null | head -20

# Check specific plugin's agents
ls .claude-plugins/opspal-salesforce/agents/ | head -20

# Verify agent manifest
cat .claude-plugins/opspal-salesforce/.claude-plugin/plugin.json | jq '.agents'
```

### Step 3: Check Routing Rules

```bash
# View agent routing configuration
cat .claude/agent-routing-rules.json 2>/dev/null | jq '.mandatoryRouting'

# Check routing keyword matches
node scripts/lib/task-domain-detector.js "your task description"
```

### Step 4: Analyze Agent Output

```bash
# Check for recent agent output files
find . -name "*.agent-output.json" -mmin -60 2>/dev/null

# Review agent logs if available
tail -50 ~/.claude/logs/agent-execution.jsonl 2>/dev/null
```

## Common Root Causes

| Root Cause | Indicators | Fix |
|------------|------------|-----|
| Wrong agent selected | Output doesn't match task | Use explicit agent with `[USE: agent-name]` |
| Agent not found | "No agent with name..." | Check plugin installation, verify agent name |
| Tool access denied | Agent can't use required tool | Check agent tool allowlist |
| Complexity mismatch | Agent times out | Use `[SEQUENTIAL]` for complex tasks |
| Missing context | Agent asks for info it should have | Provide context in task prompt |
| Circular routing | Infinite agent loops | Add `[DIRECT]` flag to break loop |
| Model mismatch | Unexpected behavior | Specify model with `model: sonnet/opus` |

## Quick Fixes

### 1. Force Specific Agent

```
[USE: sfdc-revops-auditor] Run RevOps assessment for eta-corp org
```

### 2. Skip Agent Routing

```
[DIRECT] Run simple SOQL query on Account object
```

### 3. Force Sequential Planning

```
[SEQUENTIAL] Deploy metadata with multiple dependencies
```

### 4. Check Agent Health

```bash
# Run routing health check
/routing-health

# Check plugin doctor
/plugin-doctor
```

## Agent Debugging Commands

### Check Agent Existence

```bash
# Search for agent by name
find .claude-plugins -name "*revops*.md" -o -name "*cpq*.md" 2>/dev/null

# Verify agent frontmatter
head -50 .claude-plugins/opspal-salesforce/agents/sfdc-revops-auditor.md
```

### Verify Agent Tools

```bash
# Check agent's allowed-tools section
grep -A 20 "allowed-tools:" .claude-plugins/opspal-salesforce/agents/sfdc-revops-auditor.md
```

### Test Agent Routing

```bash
# Analyze which agent would be selected
/route "your task description"

# Check complexity score
/complexity "your task description"
```

## Agent Configuration Issues

### Frontmatter Problems

Valid agent frontmatter:
```yaml
---
name: agent-name
description: Brief description of agent purpose
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
---
```

Common issues:
- Missing `name` field (agent won't be discovered)
- Empty `description` (routing won't match)
- Wrong tool names in `allowed-tools`

### Plugin Manifest Issues

Check `.claude-plugin/plugin.json`:
```json
{
  "agents": [
    "agents/sfdc-revops-auditor.md",
    "agents/sfdc-cpq-assessor.md"
  ]
}
```

Common issues:
- Agent file not listed in manifest
- Wrong path in manifest
- Manifest syntax errors

## Recovery Actions

1. **Agent not found**:
   - Verify plugin is installed: `ls .claude-plugins/`
   - Check agent exists: `ls .claude-plugins/opspal-salesforce/agents/`
   - Reinstall plugin if missing

2. **Wrong agent selected**:
   - Use explicit agent flag: `[USE: correct-agent-name]`
   - Review routing rules in CLAUDE.md
   - Update routing keywords if pattern wrong

3. **Agent timeout**:
   - Break task into smaller steps
   - Use `[SEQUENTIAL]` for planning
   - Check for infinite loops in task

4. **Agent tool error**:
   - Verify tool is in allowed-tools
   - Check MCP server status: `claude mcp list`
   - Test tool manually

## Prevention Checklist

- [ ] Review agent routing table before complex tasks
- [ ] Use explicit agent selection for critical operations
- [ ] Test agent in sandbox before production
- [ ] Monitor agent execution with tracing
- [ ] Keep plugins updated

## Agent Error Patterns

### Pattern: Routing Loop

```
Agent A invokes Agent B
Agent B invokes Agent A
(infinite loop)
```

**Fix**: Add `[DIRECT]` flag or specify explicit agent

### Pattern: Tool Access Denied

```
Error: Agent sfdc-discovery cannot use Edit tool
```

**Fix**: Check agent's allowed-tools, use different agent, or update agent config

### Pattern: Context Lost

```
Agent: "I don't have access to the org information..."
```

**Fix**: Include org context in task prompt, or use environment variables

## Related Playbooks

- [MCP Connection Playbook](./mcp-connection-playbook.md)
- [Plugin Troubleshooting Guide](../../docs/TROUBLESHOOTING_PLUGIN_LOADING.md)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-31
