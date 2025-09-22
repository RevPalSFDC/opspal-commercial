# Troubleshooting Guide

This guide helps resolve common issues with the RevPal Agent System.

## Table of Contents
- [Agent Discovery Issues](#agent-discovery-issues)
- [Routing Failures](#routing-failures)
- [MCP Connection Problems](#mcp-connection-problems)
- [Script Execution Errors](#script-execution-errors)
- [CI/CD Failures](#cicd-failures)
- [Performance Issues](#performance-issues)
- [Quick Diagnostics](#quick-diagnostics)

## Agent Discovery Issues

### Problem: Agent Not Found
**Symptoms**: Claude Code cannot find an agent that exists in the project

**Diagnosis**:
```bash
# Check if agent file exists
ls -la .claude/agents/[agent-name].md
ls -la platforms/*/.claude/agents/[agent-name].md

# Run discovery hook
bash .claude/hooks/agent-discovery.sh | grep [agent-name]

# Validate agent structure
bash scripts/validate-agents.sh
```

**Solutions**:

1. **Check YAML Frontmatter**
   ```yaml
   ---
   name: agent-name  # Must match filename without .md
   model: sonnet
   description: Brief description
   tools: Tool1, Tool2
   ---
   ```

2. **Verify File Location**
   - Core agents: `.claude/agents/`
   - SFDC agents: `platforms/SFDC/.claude/agents/`
   - HubSpot agents: `platforms/HS/.claude/agents/`

3. **Check File Permissions**
   ```bash
   chmod 644 .claude/agents/[agent-name].md
   ```

4. **Run Bootstrap**
   ```bash
   claude /bootstrap
   ```

### Problem: Duplicate Agent Names
**Symptoms**: Multiple agents with the same name in different directories

**Diagnosis**:
```bash
find . -name "[agent-name].md" -path "*/\.claude/agents/*"
```

**Solution**:
- Rename one of the agents
- Ensure unique names across all directories
- Use platform prefixes (sfdc-, hubspot-)

## Routing Failures

### Problem: Wrong Agent Selected
**Symptoms**: Task routes to incorrect agent

**Diagnosis**:
```bash
# Test specific routing
node scripts/test-agent-routing.js | grep -A2 -B2 "your task description"

# Check keyword mappings
grep -n "agent-name" scripts/test-agent-routing.js
```

**Solutions**:

1. **Update Keyword Priority**
   Edit `scripts/test-agent-routing.js`:
   ```javascript
   // More specific patterns first
   'sfdc-conflict-resolver': ['deployment failed', 'deployment error', ...],
   'release-coordinator': ['release', 'deploy', ...],  // General patterns later
   ```

2. **Add Specific Triggers**
   Update CLAUDE.md with more specific keywords

3. **Use Control Flags**
   ```
   [SEQUENTIAL] - Force sequential-planner
   [DIRECT] - Skip agent routing
   ```

### Problem: Agent Routing Test Failures
**Symptoms**: `node scripts/test-agent-routing.js` shows failures

**Solution**:
```bash
# Update test expectations
vim scripts/test-agent-routing.js

# Add missing keywords for failed tests
# Update AGENT_KEYWORDS object
```

## MCP Connection Problems

### Problem: MCP Server Not Found
**Symptoms**: Agent fails with "MCP tool not available"

**Diagnosis**:
```bash
# Check MCP configuration
cat .mcp.json | jq '.mcpServers'

# List available MCP servers
claude mcp list

# Check specific server
claude mcp status [server-name]
```

**Solutions**:

1. **Restart MCP Server**
   ```bash
   claude mcp restart [server-name]
   ```

2. **Re-add MCP Server**
   ```bash
   claude mcp add --scope project [server-name]
   ```

3. **Check Server Logs**
   ```bash
   claude mcp logs [server-name]
   ```

### Problem: MCP Tool Mismatch
**Symptoms**: Agent requires tool not provided by MCP server

**Diagnosis**:
```bash
# Check agent tool requirements
grep "^tools:" .claude/agents/[agent-name].md

# Verify MCP provides tools
cat .mcp.json | jq '.mcpServers.[server-name]'
```

**Solution**:
- Update agent's tool list
- Or configure MCP server to provide required tools

## Script Execution Errors

### Problem: Script Not Found
**Symptoms**: "command not found" or "cannot find module"

**Diagnosis**:
```bash
# Check script exists
ls -la scripts/lib/[script-name].js

# Check permissions
ls -l scripts/lib/*.js

# Check Node modules
npm list
```

**Solutions**:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Make Scripts Executable**
   ```bash
   chmod +x scripts/lib/*.js
   ```

3. **Fix Path Issues**
   ```bash
   # Run from project root
   cd /home/chris/Desktop/RevPal/Agents
   node scripts/lib/[script].js
   ```

### Problem: Script Syntax Errors
**Symptoms**: JavaScript errors when running scripts

**Solution**:
```bash
# Check syntax
node -c scripts/lib/[script].js

# Run with debugging
node --inspect scripts/lib/[script].js
```

## CI/CD Failures

### Problem: GitHub Actions Failing
**Symptoms**: Red X on commits, workflow failures

**Diagnosis**:
```bash
# Check workflow syntax
cat .github/workflows/agent-validation.yml

# Test locally
act -j validate-agents  # Using act tool
```

**Solutions**:

1. **Fix Workflow Syntax**
   - Validate YAML indentation
   - Check step dependencies

2. **Update Node Version**
   ```yaml
   - uses: actions/setup-node@v3
     with:
       node-version: '18'  # Match local version
   ```

3. **Fix Path Issues**
   - Use checkout with submodules
   - Ensure scripts are in repo

### Problem: Validation Timeouts
**Symptoms**: CI job times out

**Solution**:
```yaml
# Add timeout to steps
- name: Validate Agents
  timeout-minutes: 5
  run: bash scripts/validate-agents.sh
```

## Performance Issues

### Problem: Slow Agent Discovery
**Symptoms**: Agent discovery takes too long

**Diagnosis**:
```bash
# Time discovery
time bash .claude/hooks/agent-discovery.sh

# Count total agents
find . -path "*/\.claude/agents/*.md" | wc -l
```

**Solutions**:

1. **Optimize Discovery Script**
   ```bash
   # Use find with maxdepth
   find . -maxdepth 4 -path "*/\.claude/agents/*.md"
   ```

2. **Cache Agent List**
   ```bash
   # Generate cache
   find . -path "*/\.claude/agents/*.md" > .agent-cache
   ```

### Problem: Routing Tests Slow
**Symptoms**: test-agent-routing.js takes too long

**Solution**:
```javascript
// Optimize regex patterns
// Use string includes before regex
if (input.includes(keyword)) {
  // Then check regex if needed
}
```

## Quick Diagnostics

### Run All Diagnostics
```bash
#!/bin/bash
# Save as scripts/diagnose.sh

echo "🔍 RevPal Agent System Diagnostics"
echo "=================================="

# Check Claude Code
echo "Claude Code Version:"
claude --version || echo "❌ Claude Code not found"

# Count agents
echo -e "\n📊 Agent Count:"
echo "Main: $(ls .claude/agents/*.md 2>/dev/null | wc -l)"
echo "SFDC: $(ls platforms/SFDC/.claude/agents/*.md 2>/dev/null | wc -l)"
echo "HubSpot: $(ls platforms/HS/.claude/agents/*.md 2>/dev/null | wc -l)"

# Check MCP
echo -e "\n🔧 MCP Servers:"
if [ -f .mcp.json ]; then
  grep '"[^"]*":' .mcp.json | grep -v mcpServers | head -5
else
  echo "❌ No .mcp.json found"
fi

# Test scripts
echo -e "\n📝 Script Libraries:"
for script in scripts/lib/*.js; do
  if [ -f "$script" ]; then
    echo "✅ $(basename $script)"
  fi
done

# Check for issues
echo -e "\n⚠️  Checking for issues..."

# Duplicate agents
DUPES=$(find . -path "*/\.claude/agents/*.md" | xargs -n1 basename | sort | uniq -d)
if [ -n "$DUPES" ]; then
  echo "❌ Duplicate agents found: $DUPES"
else
  echo "✅ No duplicate agents"
fi

# Invalid YAML
for agent in $(find . -path "*/\.claude/agents/*.md"); do
  if ! head -1 "$agent" | grep -q "^---$"; then
    echo "❌ Invalid YAML: $agent"
  fi
done

echo -e "\n✅ Diagnostics complete"
```

### Common Fixes Script
```bash
#!/bin/bash
# Save as scripts/fix-common-issues.sh

echo "🔧 Applying common fixes..."

# Fix permissions
chmod +x scripts/*.sh
chmod +x scripts/lib/*.js
chmod 644 .claude/agents/*.md
chmod 644 platforms/*/.claude/agents/*.md

# Install dependencies
npm install

# Clear caches
rm -f .agent-cache
rm -f node_modules/.cache

# Rebuild
npm run build 2>/dev/null || true

echo "✅ Common fixes applied"
echo "Try running: bash scripts/validate-agents.sh"
```

## Getting Help

### Resources
- Check `docs/` directory for documentation
- Review `CLAUDE.md` for project conventions
- See `.claude/AGENT_USAGE_EXAMPLES.md` for examples

### Debug Mode
```bash
# Enable verbose output
export DEBUG=true
bash scripts/validate-agents.sh

# Node debugging
node --inspect-brk scripts/test-agent-routing.js
```

### Logs
- Claude Code logs: `~/.claude/logs/`
- Git logs: `git log --oneline -10`
- CI logs: Check GitHub Actions tab

### Contact Support
1. Check existing issues: `https://github.com/[org]/[repo]/issues`
2. Create detailed bug report with:
   - Error messages
   - Steps to reproduce
   - Diagnostic output
   - Environment details

---
Last Updated: 2025-09-13
Version: 1.0.0