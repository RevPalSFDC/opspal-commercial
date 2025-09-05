#!/bin/bash
# Agent Configuration Validation Script

echo "🔍 Agent Configuration Validation"
echo "================================="

# Check system health
echo -n "Claude doctor: "
claude doctor >/dev/null 2>&1 && echo "✅" || echo "⚠️ Issues found"

# Verify MCP servers
echo -n "MCP servers configured: "
if [ -f .mcp.json ]; then
  count=$(jq -r '.mcpServers | length' .mcp.json 2>/dev/null)
  active=$(jq -r '.mcpServers | to_entries | map(select(.value.disabled != true)) | length' .mcp.json 2>/dev/null)
  echo "✅ ($active active, $count total)"
  
  # List active servers
  echo "  Active servers:"
  jq -r '.mcpServers | to_entries | map(select(.value.disabled != true)) | .[].key' .mcp.json 2>/dev/null | sed 's/^/    - /'
else
  echo "⚠️ No .mcp.json found"
fi

# Check agent count
echo -n "Agent files: "
agent_count=$(ls -1 .claude/agents/*.md 2>/dev/null | wc -l)
if [ "$agent_count" -eq "7" ]; then
  echo "✅ $agent_count agents (expected 7)"
else
  echo "⚠️ $agent_count agents (expected 7)"
fi

# Verify Slack webhook
echo -n "Slack webhook: "
[ -n "$SLACK_WEBHOOK_URL" ] && echo "✅ Configured" || echo "⚠️ Not set (check .env or environment)"

# Check permissions
echo -n "Permissions configured: "
if [ -f .claude/settings.json ]; then
  has_perms=$(jq -e '.permissions | has("allow", "ask", "deny")' .claude/settings.json 2>/dev/null)
  [ "$has_perms" = "true" ] && echo "✅" || echo "⚠️ Missing permission rules"
else
  echo "⚠️ No settings.json"
fi

# List agents with their tools
echo -e "\n📋 Active Agents:"
for agent_file in .claude/agents/*.md; do
  if [ -f "$agent_file" ]; then
    name=$(grep "^name:" "$agent_file" | sed 's/name: //')
    tools=$(grep "^tools:" "$agent_file" | sed 's/tools: //')
    echo "  - $name"
    echo "    Tools: $tools"
  fi
done

# Check for archived agents
echo -e "\n📦 Archived Agents:"
archived_count=$(ls -1 .claude/_archive/*.md 2>/dev/null | wc -l)
echo "  $archived_count agents in archive"

echo -e "\n✨ Run 'claude /agents' for detailed view"
echo "🚀 Validation complete!"