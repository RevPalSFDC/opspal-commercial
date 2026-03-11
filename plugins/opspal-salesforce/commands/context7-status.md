---
description: Check Context7 MCP server status and agent integration
argument-hint: "[options]"
---

Check the status of Context7 integration for Salesforce project:

1. **Verify MCP Server**: Test that Context7 MCP is available and responding
2. **Check Agent Integration**: List all agents that have Context7 tools configured
3. **Test Connection**: Attempt a sample Context7 query to verify functionality
4. **Show Configuration**: Display current Context7 settings from .mcp.json

Commands to run:
```bash
# Check Context7 MCP configuration in Claude CLI
timeout 10s claude mcp get context7 || true

# Verify Context7 package is installed locally
npm ls @upstash/context7-mcp --depth=0

# List agents with Context7
rg -l "mcp__context7__" ${CLAUDE_PLUGIN_ROOT}/agents/*.md

# Show agent tools
for file in ${CLAUDE_PLUGIN_ROOT}/agents/*.md; do
  agent=$(basename "$file" .md)
  if grep -q "mcp__context7__" "$file"; then
    echo "✅ $agent"
  fi
done

# Show configuration
cat .mcp.json | jq '.mcpServers.context7'

# Verify API key presence (without printing value)
if rg -q '^CONTEXT7_API_KEY=' .env; then echo "CONTEXT7_API_KEY present"; else echo "CONTEXT7_API_KEY missing"; fi
```

Expected agents with Context7:
- sfdc-apex
- sfdc-metadata-manager
- sfdc-lightning-developer
- sfdc-integration-specialist

Report the status and any issues found.
