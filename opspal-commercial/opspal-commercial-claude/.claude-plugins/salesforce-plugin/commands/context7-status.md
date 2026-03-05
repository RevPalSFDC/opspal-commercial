---
description: Check Context7 MCP server status and agent integration
---

Check the status of Context7 integration for Salesforce project:

1. **Verify MCP Server**: Test that Context7 MCP is available and responding
2. **Check Agent Integration**: List all agents that have Context7 tools configured
3. **Test Connection**: Attempt a sample Context7 query to verify functionality
4. **Show Configuration**: Display current Context7 settings from .mcp.json

Commands to run:
```bash
# Test MCP server
npx -y @upstash/context7-mcp --help

# List agents with Context7
grep -l "mcp__context7__" .claude/agents/*.md

# Show agent tools
for file in .claude/agents/*.md; do
  agent=$(basename "$file" .md)
  if grep -q "mcp__context7__" "$file"; then
    echo "✅ $agent"
  fi
done

# Show configuration
cat .mcp.json | jq '.mcpServers.context7'
```

Expected agents with Context7:
- sfdc-apex
- sfdc-metadata-manager
- sfdc-lightning-developer
- sfdc-integration-specialist

Report the status and any issues found.
