# MCP Connection Debugging Playbook

## Overview

Use this playbook when encountering Model Context Protocol (MCP) server connection issues that prevent tools from executing properly.

## Symptoms

- "MCP server not connected" errors
- Tool execution failures with connection errors
- "Tool not found" for MCP-provided tools
- Timeout waiting for MCP server response
- Authentication failures with MCP servers

## Diagnostic Steps

### Step 1: Check MCP Server Status

```bash
# List all MCP servers
claude mcp list

# Check specific server status
claude mcp status salesforce-dx

# View MCP logs
tail -100 ~/.claude/logs/mcp.log 2>/dev/null
```

**What to look for:**
- Server status (connected, disconnected, error)
- Last heartbeat timestamp
- Error messages in status

### Step 2: Verify MCP Configuration

```bash
# Check project MCP config
cat .mcp.json 2>/dev/null | jq '.'

# Check user MCP config
cat ~/.claude/mcp.json 2>/dev/null | jq '.'

# Check merged effective config
claude mcp config show
```

**What to look for:**
- Server definitions with correct paths
- Required environment variables
- Authentication credentials

### Step 3: Test MCP Server Directly

```bash
# Test Salesforce MCP
sf org list

# Test HubSpot MCP
node .claude-plugins/opspal-hubspot/scripts/test-mcp-connection.js

# Test generic MCP server
claude mcp test salesforce-dx
```

### Step 4: Check Trace Context for MCP Calls

```bash
# Look for MCP tool calls in traces
grep '"mcp_' ~/.claude/logs/traces.jsonl | tail -10

# Check for MCP errors
grep -i "mcp.*error" ~/.claude/logs/unified.jsonl | tail -10
```

## Common Root Causes

| Root Cause | Indicators | Fix |
|------------|------------|-----|
| Server not started | Status: disconnected | Restart MCP server |
| Authentication expired | 401/403 errors | Re-authenticate |
| Config path wrong | Server not found | Fix path in .mcp.json |
| Port conflict | Address in use | Kill conflicting process |
| Missing dependencies | Module not found | npm install in server dir |
| Environment variable missing | Undefined error | Set required env vars |
| Network firewall | Connection refused | Check firewall rules |
| Server crash | Process exited | Check logs, restart |

## Quick Fixes

### 1. Restart MCP Server

```bash
# Restart specific server
claude mcp restart salesforce-dx

# Restart all MCP servers
claude mcp restart all
```

### 2. Re-add MCP Server

```bash
# Remove and re-add server
claude mcp remove salesforce-dx
claude mcp add --scope project salesforce-dx /path/to/server

# Or for npm-based server
claude mcp add salesforce-dx -- npx @salesforce/mcp-server
```

### 3. Check Environment Variables

```bash
# Verify required env vars are set
env | grep -E "SALESFORCE|HUBSPOT|SUPABASE" | head -10

# Source .env file if needed
source .env
```

### 4. Fix Authentication

```bash
# Salesforce re-auth
sf org login web --target-org <org-alias>

# HubSpot re-auth
node scripts/lib/unified-auth-manager.js refresh hubspot
```

## MCP Configuration Examples

### Salesforce MCP (.mcp.json)

```json
{
  "servers": {
    "salesforce-dx": {
      "command": "npx",
      "args": ["-y", "@anthropic/salesforce-mcp"],
      "env": {
        "SALESFORCE_TARGET_ORG": "production"
      }
    }
  }
}
```

### Custom MCP Server

```json
{
  "servers": {
    "custom-server": {
      "command": "node",
      "args": ["./scripts/mcp/custom-server.js"],
      "env": {
        "API_KEY": "${CUSTOM_API_KEY}"
      }
    }
  }
}
```

## MCP Server Health Check Script

```bash
#!/bin/bash
# mcp-health-check.sh

echo "=== MCP Server Health Check ==="

# List servers
echo -e "\n📋 Configured Servers:"
claude mcp list

# Test each server
echo -e "\n🔍 Testing Servers:"
for server in $(claude mcp list --format json | jq -r '.servers[].name'); do
  status=$(claude mcp status "$server" 2>/dev/null | head -1)
  echo "  $server: $status"
done

# Check logs for recent errors
echo -e "\n⚠️ Recent MCP Errors:"
grep -i "error" ~/.claude/logs/mcp.log 2>/dev/null | tail -5 || echo "  None found"
```

## Debugging MCP Protocol Issues

### Enable Debug Logging

```bash
# Set debug environment
export MCP_DEBUG=1
export DEBUG=mcp:*

# Run with verbose output
claude mcp start salesforce-dx --verbose
```

### Capture MCP Traffic

```bash
# Log MCP messages
export MCP_LOG_FILE=~/.claude/logs/mcp-traffic.jsonl
```

### Verify Protocol Version

```bash
# Check MCP protocol version
claude mcp info salesforce-dx | grep version
```

## Recovery Actions

1. **Server won't start**:
   - Check server path exists
   - Verify dependencies installed
   - Review server logs for startup errors

2. **Connection times out**:
   - Increase timeout in config
   - Check network connectivity
   - Verify firewall allows connection

3. **Authentication fails**:
   - Re-authenticate with platform
   - Refresh OAuth tokens
   - Check credential expiration

4. **Tools not available**:
   - Verify server exposes expected tools
   - Check tool manifest in server
   - Restart server to refresh tool list

## Prevention Checklist

- [ ] Add MCP server health check to startup
- [ ] Set up alerts for MCP disconnections
- [ ] Document required environment variables
- [ ] Test MCP connections after config changes
- [ ] Keep MCP servers updated

## MCP Server Logs Location

| Server Type | Log Location |
|-------------|--------------|
| Salesforce DX | `~/.sf/sf.log` |
| HubSpot | `~/.hubspot/logs/` |
| Custom | As configured in server |
| Claude MCP | `~/.claude/logs/mcp.log` |

## Related Playbooks

- [Agent Failure Playbook](./agent-failure-playbook.md)
- [Authentication Playbook](./authentication-playbook.md)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-31
