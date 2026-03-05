#!/bin/bash

###############################################################################
# Fix Tooling API Query Issues - Simplified Version
#
# Corrects common Tooling API query mistakes:
# - CustomField -> FieldDefinition
###############################################################################

echo "=' Fixing Tooling API queries across the codebase..."

# Simple replacement without complex patterns
find . -type f \( -name "*.sh" -o -name "*.js" -o -name "*.py" -o -name "*.md" \) \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -not -path "./mcp-tools/node_modules/*" \
    -not -path "./mcp-extensions/node_modules/*" \
    -exec grep -l "FROM CustomField" {} \; | while read -r file; do

    # Create backup
    cp "$file" "${file}.bak" 2>/dev/null || true

    # Simple replacements
    sed -i 's/FROM CustomField/FROM FieldDefinition/g' "$file"
    sed -i "s/TableEnumOrId/EntityDefinition.QualifiedApiName/g" "$file"

    echo " Fixed: $file"
done

echo ""
echo "( Tooling API query fixes complete!"
echo ""
echo "=Ë Key fixes applied:"
echo "  - CustomField ’ FieldDefinition"
echo "  - TableEnumOrId ’ EntityDefinition.QualifiedApiName"