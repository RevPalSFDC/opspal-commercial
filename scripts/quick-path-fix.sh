#!/bin/bash

# Quick fix for critical hardcoded paths
echo "Fixing critical hardcoded paths..."

# Fix ClaudeSFDC references in key scripts
for file in \
    "platforms/SFDC/scripts/update-agents-mcp-priority.sh" \
    "platforms/SFDC/scripts/setup-claude-tools.sh" \
    "platforms/SFDC/scripts/update-opportunities-test.sh" \
    "platforms/SFDC/scripts/claude-performance-monitor.sh" \
    "platforms/SFDC/scripts/update-opportunities-batch.sh" \
    "platforms/SFDC/scripts/deploy-revenue-fields-enhanced.sh" \
    "platforms/SFDC/scripts/claude-debug-setup.sh" \
    "platforms/SFDC/scripts/safe-soql-query.sh" \
    "platforms/SFDC/scripts/claude-optimize-config.sh" \
    "platforms/SFDC/scripts/claude-with-retry.sh" \
    "platforms/SFDC/integration/run-task-retrieval.sh" \
    "platforms/SFDC/tests/test-flexipage-validator.js"
do
    if [ -f "$file" ]; then
        echo "Fixing: $file"
        sed -i.bak 's|/ClaudeSFDC/|/platforms/SFDC/|g' "$file" 2>/dev/null || true
        sed -i 's|ClaudeSFDC/|platforms/SFDC/|g' "$file" 2>/dev/null || true
        sed -i 's|./instances/|./platforms/SFDC/instances/|g' "$file" 2>/dev/null || true
    fi
done

# Create symlinks for backward compatibility
if [ ! -L "ClaudeSFDC" ]; then
    ln -s "platforms/SFDC" "ClaudeSFDC"
    echo "Created symlink: ClaudeSFDC -> platforms/SFDC"
fi

if [ ! -L "instances" ] && [ ! -d "instances" ]; then
    ln -s "platforms/SFDC/instances" "instances"
    echo "Created symlink: instances -> platforms/SFDC/instances"
fi

echo "Quick fix completed!"
echo ""
echo "Backup files created with .bak extension"
echo "To verify changes: grep -r 'ClaudeSFDC' platforms/SFDC/scripts/ --exclude='*.bak'"