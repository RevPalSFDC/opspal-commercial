#!/bin/bash

# Script to update all SFDC agents to prioritize MCP tools
# This ensures consistency across all agents

AGENT_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"

# List of agents that need updating (excluding those already done or using MCP)
AGENTS_TO_UPDATE=(
    "sfdc-apex-developer.yaml"
    "sfdc-automation-builder.yaml"
    "sfdc-security-admin.yaml"
    "sfdc-deployment-manager.yaml"
    "sfdc-integration-specialist.yaml"
    "sfdc-cli-executor.yaml"
    "sfdc-field-analyzer.yaml"
    "sfdc-test-data-generator.yaml"
    "sfdc-permission-analyzer.yaml"
    "sfdc-data-validator.yaml"
    "sfdc-orchestrator.yaml"
    "sfdc-planner.yaml"
    "sfdc-lightning-page-manager.yaml"
    "sfdc-knowledge-manager.yaml"
    "sfdc-project-manager.yaml"
)

echo "Updating SFDC agents to prioritize MCP tools..."

for agent in "${AGENTS_TO_UPDATE[@]}"; do
    AGENT_FILE="$AGENT_DIR/$agent"
    
    if [ ! -f "$AGENT_FILE" ]; then
        echo "Warning: $agent not found, skipping..."
        continue
    fi
    
    echo "Processing $agent..."
    
    # Backup original
    cp "$AGENT_FILE" "$AGENT_FILE.bak"
    
    # Update tools section to add salesforce-dx as primary
    # Check if already has salesforce-dx
    if ! grep -q "salesforce-dx" "$AGENT_FILE"; then
        # Find the tools: section and add salesforce-dx as first tool
        sed -i '/^tools:$/a\  - salesforce-dx  # MCP Salesforce tools - PRIMARY METHOD' "$AGENT_FILE"
        
        # Add comment to Bash tool if present
        sed -i 's/^  - Bash$/  - Bash          # FALLBACK ONLY when MCP unavailable/' "$AGENT_FILE"
        
        # Add comment to Task tool if present
        sed -i 's/^  - Task$/  - Task          # For delegating to other agents only/' "$AGENT_FILE"
    fi
    
    # Check if execution_priority section exists, if not add it after tools section
    if ! grep -q "execution_priority:" "$AGENT_FILE"; then
        # Find a good insertion point (after capabilities or tools section)
        if grep -q "^capabilities:" "$AGENT_FILE"; then
            # Insert after capabilities section ends (before next top-level key)
            awk '/^capabilities:/ {p=1} p && /^[a-z_]+:/ && !/^  / {print "execution_priority:\n  primary_method:\n    - ALWAYS attempt MCP salesforce-dx tools first\n    - Use MCP for all Salesforce operations\n    - Check MCP tool availability before falling back\n  fallback_method:\n    - Use sf CLI only if MCP tools are unavailable\n    - Document why MCP tools couldn'\''t be used\n    - Alert user that fallback method is being used\n"; p=0} 1' "$AGENT_FILE" > "$AGENT_FILE.tmp" && mv "$AGENT_FILE.tmp" "$AGENT_FILE"
        fi
    fi
    
    echo "✓ Updated $agent"
done

echo ""
echo "Adding MCP best practices to agents..."

# Add best_practices section if missing or update existing
for agent in "${AGENTS_TO_UPDATE[@]}"; do
    AGENT_FILE="$AGENT_DIR/$agent"
    
    if [ ! -f "$AGENT_FILE" ]; then
        continue
    fi
    
    # Check if best_practices section exists
    if grep -q "^best_practices:" "$AGENT_FILE"; then
        # Check if mcp_usage subsection exists
        if ! grep -q "mcp_usage:" "$AGENT_FILE"; then
            # Add mcp_usage subsection to existing best_practices
            sed -i '/^best_practices:$/a\  mcp_usage:\n    - Query operations: Use MCP salesforce-dx query tools\n    - Data operations: Use MCP salesforce-dx data tools\n    - Metadata operations: Use MCP salesforce-dx metadata tools\n    - Only use sf CLI as absolute last resort' "$AGENT_FILE"
        fi
    fi
done

echo ""
echo "✅ All agents updated to prioritize MCP tools!"
echo ""
echo "Summary of changes:"
echo "- Added salesforce-dx as primary tool in tools section"
echo "- Added execution_priority section for MCP-first approach"
echo "- Added MCP usage guidance to best_practices"
echo "- Marked Bash and Task tools as fallback methods"
echo ""
echo "Backup files created with .bak extension"
