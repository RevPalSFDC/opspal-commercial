#!/bin/bash

##############################################################################
# update-subagents-metadata.sh - Update all SFDC sub-agents with metadata framework
##############################################################################

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
AGENTS_DIR="$SCRIPT_DIR/../.claude/agents"
UPDATED_COUNT=0

echo "🔄 Updating SFDC sub-agents with metadata framework capabilities..."

# Function to add metadata framework reference to agent
add_metadata_framework() {
    local agent_file="$1"
    local agent_name=$(basename "$agent_file" .md)
    
    echo "  Updating $agent_name..."
    
    # Check if already has metadata framework reference
    if grep -q "metadata-retrieval-framework" "$agent_file"; then
        echo "    ✓ Already updated"
        return
    fi
    
    # Add metadata framework section before the closing
    cat >> "$agent_file" << 'EOF'

## Metadata Framework Integration

This agent now uses the instance-agnostic metadata framework for all Salesforce metadata operations.

### Available Tools
```javascript
const MetadataRetriever = require('../../scripts/lib/metadata-retrieval-framework');
const InstanceAgnosticAnalyzer = require('../../scripts/lib/instance-agnostic-metadata-analyzer');
const PackageXMLGenerator = require('../../scripts/lib/package-xml-generator');
```

### Key Capabilities
- Retrieve validation rules with formulas for any object
- Access flow entry criteria and trigger types
- Analyze field requirements across layouts
- Check profile visibility settings
- Works with ANY Salesforce instance without hardcoding

### Usage Example
```javascript
// Initialize for any org
const retriever = new MetadataRetriever(orgAlias);

// Get complete metadata
const validationRules = await retriever.getValidationRules('Opportunity');
const flows = await retriever.getFlows('Account');
const layouts = await retriever.getLayouts('Contact');
```

### No Hardcoding Policy
This agent operates with zero hardcoded values:
- No hardcoded object names
- No hardcoded field names  
- No hardcoded record type names
- Discovers everything dynamically from the instance
EOF
    
    ((UPDATED_COUNT++))
}

# Update all SFDC agents
for agent in "$AGENTS_DIR"/sfdc-*.md; do
    if [ -f "$agent" ]; then
        add_metadata_framework "$agent"
    fi
done

echo ""
echo "✅ Updated $UPDATED_COUNT SFDC sub-agents with metadata framework"
echo ""

# Create summary of updated agents
echo "📋 Updated Agents Summary:"
echo "=========================="
for agent in "$AGENTS_DIR"/sfdc-*.md; do
    if [ -f "$agent" ]; then
        agent_name=$(basename "$agent" .md)
        echo "  - $agent_name: Enhanced with metadata framework"
    fi
done

echo ""
echo "🎯 All SFDC sub-agents can now:"
echo "  • Retrieve complete metadata including formulas"
echo "  • Work with any Salesforce instance"
echo "  • Handle API limitations automatically"
echo "  • Analyze objects without hardcoded values"