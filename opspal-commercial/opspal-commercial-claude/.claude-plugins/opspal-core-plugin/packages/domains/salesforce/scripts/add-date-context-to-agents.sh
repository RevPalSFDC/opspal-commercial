#!/bin/bash

# Add date context reference to all agent YAML files
# This ensures all agents are aware of the current date

echo "Adding date context to all agents..."
echo "======================================"

AGENT_DIR="../agents"
DATE_CONTEXT_FILE="../agents/shared/date-context.yaml"
CURRENT_DATE=$(date +%Y-%m-%d)

# Counter
updated=0
skipped=0

# Process all YAML files in agents directory
for agent_file in $(find "$AGENT_DIR" -name "*.yaml" -type f | grep -v shared | grep -v templates); do
    filename=$(basename "$agent_file")
    
    # Check if already has date context
    if grep -q "date_awareness:" "$agent_file"; then
        echo "✓ $filename already has date context"
        skipped=$((skipped + 1))
    else
        # Get the first few lines to find where to insert
        if grep -q "^stage:" "$agent_file"; then
            # Insert after stage line
            sed -i "/^stage:/a\\
\\
context:\\
  date_awareness: \"@import ../shared/date-context.yaml\"\\
  current_date: \"$CURRENT_DATE\"  # Updated: $(date +%Y-%m-%d)" "$agent_file"
            echo "✅ Updated $filename"
            updated=$((updated + 1))
        elif grep -q "^version:" "$agent_file"; then
            # Insert after version line
            sed -i "/^version:/a\\
\\
context:\\
  date_awareness: \"@import ../shared/date-context.yaml\"\\
  current_date: \"$CURRENT_DATE\"  # Updated: $(date +%Y-%m-%d)" "$agent_file"
            echo "✅ Updated $filename"
            updated=$((updated + 1))
        else
            echo "⚠️ Could not update $filename - no suitable insertion point"
            skipped=$((skipped + 1))
        fi
    fi
done

echo ""
echo "======================================"
echo "Summary:"
echo "  Updated: $updated agents"
echo "  Skipped: $skipped agents"
echo ""
echo "Date context file: $DATE_CONTEXT_FILE"
echo "Current date: $CURRENT_DATE"
echo ""
echo "To update the date context, run:"
echo "  node scripts/update-agent-date-context.js"