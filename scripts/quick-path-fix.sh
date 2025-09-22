#!/bin/bash

# Quick fix for critical hardcoded paths
echo "Fixing critical hardcoded paths..."

# Fix ClaudeSFDC references in key scripts
for file in \
    "opspal-internal/SFDC/scripts/update-agents-mcp-priority.sh" \
    "opspal-internal/SFDC/scripts/setup-claude-tools.sh" \
    "opspal-internal/SFDC/scripts/update-opportunities-test.sh" \
    "opspal-internal/SFDC/scripts/claude-performance-monitor.sh" \
    "opspal-internal/SFDC/scripts/update-opportunities-batch.sh" \
    "opspal-internal/SFDC/scripts/deploy-revenue-fields-enhanced.sh" \
    "opspal-internal/SFDC/scripts/claude-debug-setup.sh" \
    "opspal-internal/SFDC/scripts/safe-soql-query.sh" \
    "opspal-internal/SFDC/scripts/claude-optimize-config.sh" \
    "opspal-internal/SFDC/scripts/claude-with-retry.sh" \
    "opspal-internal/SFDC/integration/run-task-retrieval.sh" \
    "opspal-internal/SFDC/tests/test-flexipage-validator.js"
do
    if [ -f "$file" ]; then
        echo "Fixing: $file"
        sed -i.bak 's|/ClaudeSFDC/|/opspal-internal/SFDC/|g' "$file" 2>/dev/null || true
        sed -i 's|ClaudeSFDC/|opspal-internal/SFDC/|g' "$file" 2>/dev/null || true
        sed -i 's|./instances/|./opspal-internal/SFDC/instances/|g' "$file" 2>/dev/null || true
    fi
done

# Create symlinks for backward compatibility
if [ ! -L "ClaudeSFDC" ]; then
    ln -s "opspal-internal/SFDC" "ClaudeSFDC"
    echo "Created symlink: ClaudeSFDC -> opspal-internal/SFDC"
fi

if [ ! -L "instances" ] && [ ! -d "instances" ]; then
    ln -s "opspal-internal/SFDC/instances" "instances"
    echo "Created symlink: instances -> opspal-internal/SFDC/instances"
fi

echo "Quick fix completed!"
echo ""
echo "Backup files created with .bak extension"
echo "To verify changes: grep -r 'ClaudeSFDC' opspal-internal/SFDC/scripts/ --exclude='*.bak'"