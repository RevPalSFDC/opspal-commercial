#!/bin/bash

# Script to add Instance-Agnostic Toolkit reference to multiple agents
# Run from SFDC root directory

AGENTS_DIR=".claude/agents"

# Toolkit reference template
read -r -d '' TOOLKIT_SECTION << 'EOF'

### Instance-Agnostic Toolkit (NEW - v3.0)

@import agents/shared/instance-agnostic-toolkit-reference.md

**CRITICAL**: Use the Instance-Agnostic Toolkit for all operations to eliminate hardcoded org aliases, field names, and manual discovery.

**Quick Start**:
```javascript
const toolkit = require('./scripts/lib/instance-agnostic-toolkit');
const kit = toolkit.createToolkit(null, { verbose: true });
await kit.init();

// Auto-detect org
const org = await kit.getOrgContext();

// Discover fields with fuzzy matching
const field = await kit.getField('Contact', 'funnel stage');

// Execute with automatic retry + validation bypass
await kit.executeWithRecovery(async () => {
    return await operation();
}, { objectName: 'Contact', maxRetries: 3 });
```

**Mandatory Usage**:
- Use `kit.executeWithRecovery()` for ALL bulk operations
- Use `kit.getField()` instead of hardcoding field names
- Use `kit.getOrgContext()` instead of hardcoded org aliases
- Use `kit.executeWithBypass()` for validation-sensitive operations

**Documentation**: `.claude/agents/shared/instance-agnostic-toolkit-reference.md`
EOF

# Function to update agent file
update_agent() {
    local agent_file="$1"
    local agent_name=$(basename "$agent_file" .md)

    echo "Processing: $agent_name"

    # Check if already has toolkit reference
    if grep -q "Instance-Agnostic Toolkit" "$agent_file" 2>/dev/null; then
        echo "  ✓ Already has toolkit reference"
        return 0
    fi

    # Check if has Operational Playbooks section
    if ! grep -q "Operational Playbooks" "$agent_file" 2>/dev/null; then
        echo "  ⚠  No Operational Playbooks section - skipping"
        return 1
    fi

    # Create backup
    cp "$agent_file" "${agent_file}.bak"

    # Find line numbers
    local playbooks_end=$(grep -n "Documentation.*docs/playbooks" "$agent_file" | tail -1 | cut -d: -f1)

    if [ -z "$playbooks_end" ]; then
        echo "  ❌ Could not find insertion point"
        rm "${agent_file}.bak"
        return 1
    fi

    # Insert toolkit section
    {
        head -n "$playbooks_end" "$agent_file"
        echo "$TOOLKIT_SECTION"
        tail -n +"$((playbooks_end + 1))" "$agent_file" | sed '1{/^$/d}'
    } > "${agent_file}.tmp"

    mv "${agent_file}.tmp" "$agent_file"
    rm "${agent_file}.bak"

    echo "  ✅ Updated successfully"
    return 0
}

# List of high-priority agents to update
AGENTS=(
    "sfdc-merge-orchestrator"
    "sfdc-orchestrator"
    "sfdc-planner"
    "sfdc-deployment-manager"
    "sfdc-conflict-resolver"
    "sfdc-apex-developer"
    "sfdc-automation-builder"
    "sfdc-security-admin"
    "sfdc-field-analyzer"
    "sfdc-dependency-analyzer"
)

echo "Updating ${#AGENTS[@]} agent files..."
echo ""

updated=0
skipped=0
failed=0

for agent in "${AGENTS[@]}"; do
    agent_file="${AGENTS_DIR}/${agent}.md"

    if [ ! -f "$agent_file" ]; then
        echo "⚠  $agent: File not found"
        ((failed++))
        continue
    fi

    if update_agent "$agent_file"; then
        ((updated++))
    else
        ((skipped++))
    fi
done

echo ""
echo "Summary:"
echo "  ✅ Updated: $updated"
echo "  ⚠  Skipped: $skipped"
echo "  ❌ Failed: $failed"
