#!/bin/bash

#
# Update Salesforce Agents with Error Prevention Notice
#
# Adds import statement for error-prevention-notice.yaml to all agent files
# that use the Bash tool and run sf CLI commands.
#
# Usage: bash update-agents-with-error-prevention.sh
#
# Version: 1.0.0
# Created: 2025-10-24

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/../agents"
SHARED_NOTICE="@import agents/shared/error-prevention-notice.yaml"

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Wiring Error Prevention System to Sub-Agents             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Counter for updates
UPDATED=0
SKIPPED=0
TOTAL=0

# Find all agent files that use Bash tool
echo -e "${YELLOW}Scanning agents for Bash tool usage...${NC}"
echo ""

for agent_file in "$AGENTS_DIR"/sfdc-*.md; do
    [ -e "$agent_file" ] || continue

    TOTAL=$((TOTAL + 1))
    agent_name=$(basename "$agent_file")

    # Check if agent uses Bash tool
    if ! grep -q "tools:.*Bash" "$agent_file"; then
        echo "  ⏩ Skipping $agent_name (no Bash tool)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    # Check if already has the import
    if grep -q "error-prevention-notice.yaml" "$agent_file"; then
        echo "  ✅ Already wired: $agent_name"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    # Find the line after the frontmatter (after second ---)
    # and add the import statement

    # Create temporary file
    temp_file=$(mktemp)

    # Track frontmatter state
    in_frontmatter=false
    frontmatter_count=0
    import_added=false

    while IFS= read -r line; do
        echo "$line" >> "$temp_file"

        # Detect frontmatter boundaries
        if [[ "$line" == "---" ]]; then
            frontmatter_count=$((frontmatter_count + 1))

            # After closing frontmatter, add import
            if [[ $frontmatter_count -eq 2 && $import_added == false ]]; then
                echo "" >> "$temp_file"
                echo "# Error Prevention System (Automatic)" >> "$temp_file"
                echo "$SHARED_NOTICE" >> "$temp_file"
                import_added=true
            fi
        fi
    done < "$agent_file"

    # Only update if import was added
    if [[ $import_added == true ]]; then
        mv "$temp_file" "$agent_file"
        echo -e "  ${GREEN}✅ Updated: $agent_name${NC}"
        UPDATED=$((UPDATED + 1))
    else
        rm "$temp_file"
        echo "  ⚠️  Could not add import to $agent_name (frontmatter not found)"
        SKIPPED=$((SKIPPED + 1))
    fi
done

# Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Summary                                                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Total agents scanned: $TOTAL"
echo -e "  ${GREEN}Updated: $UPDATED${NC}"
echo "  Skipped: $SKIPPED"
echo ""

if [[ $UPDATED -gt 0 ]]; then
    echo -e "${GREEN}✅ Error Prevention System successfully wired to $UPDATED agent(s)!${NC}"
    echo ""
    echo "Agents now have automatic:"
    echo "  - SOQL query validation and correction"
    echo "  - Deployment source validation"
    echo "  - CSV line ending correction"
    echo "  - Missing flag injection (--use-tooling-api)"
    echo "  - Error blocking with guidance"
    echo ""
    echo "Documentation: .claude-plugins/opspal-core-plugin/packages/domains/salesforce/docs/ERROR_PREVENTION_SYSTEM.md"
else
    echo -e "${YELLOW}No updates needed - all agents already wired!${NC}"
fi

exit 0
