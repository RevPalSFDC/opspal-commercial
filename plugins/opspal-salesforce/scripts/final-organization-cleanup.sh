#!/bin/bash

# Final organization cleanup - move remaining files to appropriate locations
# This handles documentation and remaining scattered items

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Final SFDC Organization Cleanup${NC}"
echo ""

SFDC_DIR="${PROJECT_ROOT:-/path/to/project}/legacy/SFDC"
cd "$SFDC_DIR"

# Move remaining documentation files
echo -e "${YELLOW}Organizing remaining documentation...${NC}"

# Keep essential files in root
# CLAUDE.md, README.md, CHANGELOG.md, LICENSE should stay in root

# Move secondary docs
[ -f "AGENTS.md" ] && mv AGENTS.md docs/
[ -f "IMMEDIATE_ACTIONS.md" ] && mv IMMEDIATE_ACTIONS.md docs/
[ -f "MIGRATION_NOTES.md" ] && mv MIGRATION_NOTES.md docs/
[ -f "ORG_ALIAS_MANAGEMENT.md" ] && mv ORG_ALIAS_MANAGEMENT.md docs/

# Move remaining project directories
echo -e "${YELLOW}Organizing project directories...${NC}"
mkdir -p projects/misc

for dir in backup config coverage data data-generation deployment-logs examples field-analysis-reports flow-templates fls-reports frameworks integration; do
    if [ -d "$dir" ] && [ "$(ls -A $dir 2>/dev/null)" ]; then
        echo "  Moving $dir..."
        mv "$dir" projects/misc/ 2>/dev/null || true
    elif [ -d "$dir" ]; then
        rmdir "$dir" 2>/dev/null || true
    fi
done

# Docker files can stay in root for now (standard practice)
echo -e "${YELLOW}Docker files remain in root (standard practice)${NC}"

# Final cleanup of any stray script files
if [ -f "fix-organization.sh" ]; then
    mv fix-organization.sh scripts/
fi

echo ""
echo -e "${GREEN}✓ Final cleanup complete${NC}"
echo ""

# Show what remains in root
echo "Files remaining in root (these are appropriate):"
ls -1 | grep -vE "^(scripts|docs|agents|templates|instances|shared|force-app|.git|.claude|error-logging|projects|archives|example-company-production-cleanup|test-enforcement)" | grep -vE "^\." || echo "  Only appropriate files remain!"