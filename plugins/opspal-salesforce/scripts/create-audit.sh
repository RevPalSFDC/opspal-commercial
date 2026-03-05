#!/bin/bash

# Create new audit structure for Salesforce instances
# Usage: ./create-audit.sh <instance-name> <audit-type>
# Example: ./create-audit.sh sample-org-uat commerce

INSTANCE=$1
AUDIT_TYPE=$2
DATE=$(date +%Y-%m-%d)

if [ -z "$INSTANCE" ] || [ -z "$AUDIT_TYPE" ]; then
    echo "Usage: $0 <instance-name> <audit-type>"
    echo "Example: $0 sample-org-uat commerce"
    echo ""
    echo "Available audit types:"
    echo "  - frontend    : Frontend architecture and components"
    echo "  - commerce    : B2B Commerce and WebStores"
    echo "  - security    : Security and permissions"
    echo "  - performance : Performance optimization"
    echo "  - data        : Data quality and integrity"
    exit 1
fi

INSTANCE_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
AUDIT_DIR="$INSTANCE_DIR/audits/$DATE-$AUDIT_TYPE"

# Check if instance exists
if [ ! -d "$INSTANCE_DIR" ]; then
    echo "Error: Instance '$INSTANCE' not found at $INSTANCE_DIR"
    exit 1
fi

# Check if audit already exists
if [ -d "$AUDIT_DIR" ]; then
    echo "Error: Audit already exists at $AUDIT_DIR"
    exit 1
fi

# Create audit structure
echo "Creating audit structure for $INSTANCE ($AUDIT_TYPE)..."
mkdir -p "$AUDIT_DIR"/{analysis,outputs,deliverables}

# Copy template README and customize
TEMPLATE="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
if [ -f "$TEMPLATE" ]; then
    sed "s/\[Audit Type\]/${AUDIT_TYPE^}/g" "$TEMPLATE" | \
    sed "s/\[Instance Name\]/$INSTANCE/g" | \
    sed "s/YYYY-MM-DD/$DATE/g" | \
    sed "s/\[org-alias\]/$INSTANCE/g" > "$AUDIT_DIR/README.md"
    echo "✅ Created README from template"
else
    echo "⚠️  Template not found, creating basic README"
    cat > "$AUDIT_DIR/README.md" << EOF
# ${AUDIT_TYPE^} Audit - $INSTANCE

**Date**: $DATE
**Org**: $INSTANCE
**Type**: ${AUDIT_TYPE^}
**Status**: 🔄 In Progress

## Executive Summary

[Audit in progress]

## File Navigation

- \`analysis/\` - Detailed analysis reports
- \`outputs/\` - Raw data files
- \`deliverables/\` - Final deliverables

EOF
fi

# Create .gitkeep files
touch "$AUDIT_DIR/analysis/.gitkeep"
touch "$AUDIT_DIR/outputs/.gitkeep"
touch "$AUDIT_DIR/deliverables/.gitkeep"

# Update instance audit index
INDEX_FILE="$INSTANCE_DIR/audits/README.md"
if [ ! -f "$INDEX_FILE" ]; then
    echo "Creating audit index file..."
    cat > "$INDEX_FILE" << EOF
# $INSTANCE - Audit History

## Audit Index

| Date | Audit Type | Status | Link |
|------|------------|--------|------|
| $DATE | ${AUDIT_TYPE^} | 🔄 In Progress | [View](./$DATE-$AUDIT_TYPE/) |
EOF
else
    # Add new entry to existing index
    echo "| $DATE | ${AUDIT_TYPE^} | 🔄 In Progress | [View](./$DATE-$AUDIT_TYPE/) |" >> "$INDEX_FILE"
fi

echo ""
echo "✅ Audit structure created successfully!"
echo ""
echo "📁 Location: $AUDIT_DIR"
echo ""
echo "Next steps:"
echo "1. Run your audit tools/agents"
echo "2. Save analysis reports to: $AUDIT_DIR/analysis/"
echo "3. Save data outputs to: $AUDIT_DIR/outputs/"
echo "4. Save final deliverables to: $AUDIT_DIR/deliverables/"
echo "5. Update the README.md with your findings"
echo ""