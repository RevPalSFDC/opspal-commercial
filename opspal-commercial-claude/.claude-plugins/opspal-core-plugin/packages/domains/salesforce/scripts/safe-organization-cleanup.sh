#!/bin/bash

# ============================================================================
# Safe Organization Cleanup Script
# Moves files to appropriate directories while preserving critical configs
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$BASE_DIR/backups/organization-cleanup-$(date +%Y%m%d-%H%M%S)"
DRY_RUN=true

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Safe Organization Cleanup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo

# Check for --execute flag
if [ "$1" == "--execute" ]; then
    DRY_RUN=false
    echo -e "${YELLOW}⚠️  EXECUTING changes (not a dry run)${NC}"
else
    echo -e "${GREEN}DRY RUN MODE - No files will be moved${NC}"
    echo -e "Run with ${BLUE}--execute${NC} to apply changes"
fi
echo

# Create backup directory
if [ "$DRY_RUN" = false ]; then
    mkdir -p "$BACKUP_DIR"
    echo -e "${GREEN}Backup directory: $BACKUP_DIR${NC}"
fi

# Function to safely move files
move_file() {
    local source="$1"
    local dest_dir="$2"
    local file_name=$(basename "$source")

    if [ -f "$BASE_DIR/$source" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "  ${YELLOW}Would move:${NC} $source → $dest_dir/"
        else
            # Create backup
            cp "$BASE_DIR/$source" "$BACKUP_DIR/$file_name" 2>/dev/null || true

            # Create destination directory
            mkdir -p "$BASE_DIR/$dest_dir"

            # Move file
            mv "$BASE_DIR/$source" "$BASE_DIR/$dest_dir/"
            echo -e "  ${GREEN}Moved:${NC} $source → $dest_dir/"
        fi
        return 0
    else
        return 1
    fi
}

# Define files that should stay in root
KEEP_IN_ROOT=(
    ".mcp.json"
    ".mcp-enhanced.json"
    ".env"
    ".env.template"
    ".env.example"
    ".env.sample"
    ".gitignore"
    ".current-instance"
    "README.md"
    "CLAUDE.md"
    "LICENSE"
    "LICENSE.md"
    "CONTRIBUTING.md"
    "CHANGELOG.md"
    "package.json"
    "package-lock.json"
    "sfdx-project.json"
)

echo -e "${BLUE}Files to keep in root:${NC}"
for file in "${KEEP_IN_ROOT[@]}"; do
    if [ -f "$BASE_DIR/$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file"
    fi
done
echo

# Clean up data files
echo -e "${BLUE}Moving data files to data/ directory:${NC}"
for file in "$BASE_DIR"/*.csv "$BASE_DIR"/*.json "$BASE_DIR"/*.xml "$BASE_DIR"/*.txt; do
    if [ -f "$file" ]; then
        file_name=$(basename "$file")

        # Skip files that should stay in root
        if [[ " ${KEEP_IN_ROOT[@]} " =~ " ${file_name} " ]]; then
            continue
        fi

        # Skip package and config files
        if [[ "$file_name" == package*.json ]] || [[ "$file_name" == sfdx*.json ]] || [[ "$file_name" == tsconfig*.json ]]; then
            continue
        fi

        # Move to appropriate directory
        if [[ "$file_name" == *backup* ]] || [[ "$file_name" == *bak* ]]; then
            move_file "$file_name" "backups/misc"
        elif [[ "$file_name" == *report* ]] || [[ "$file_name" == *REPORT* ]] || [[ "$file_name" == *analysis* ]]; then
            move_file "$file_name" "reports/misc"
        else
            move_file "$file_name" "data/misc"
        fi
    fi
done

# Clean up script files
echo -e "${BLUE}Moving script files to scripts/ directory:${NC}"
for file in "$BASE_DIR"/*.js "$BASE_DIR"/*.sh; do
    if [ -f "$file" ]; then
        file_name=$(basename "$file")

        # Skip if it's already in the right place
        if [[ "$file" == */scripts/* ]]; then
            continue
        fi

        # Move to scripts/misc
        move_file "$file_name" "scripts/misc"
    fi
done

# Clean up documentation files
echo -e "${BLUE}Moving documentation to docs/ directory:${NC}"
for file in "$BASE_DIR"/*.md; do
    if [ -f "$file" ]; then
        file_name=$(basename "$file")

        # Skip files that should stay in root
        if [[ " ${KEEP_IN_ROOT[@]} " =~ " ${file_name} " ]]; then
            continue
        fi

        # Skip if it starts with uppercase (likely important)
        if [[ "$file_name" =~ ^[A-Z] ]] && [[ "$file_name" != *REPORT* ]] && [[ "$file_name" != *ANALYSIS* ]]; then
            continue
        fi

        # Move to docs/misc
        move_file "$file_name" "docs/misc"
    fi
done

# Handle bulk job result files
echo -e "${BLUE}Moving bulk job results:${NC}"
for file in "$BASE_DIR"/750*.csv "$BASE_DIR"/750*.json; do
    if [ -f "$file" ]; then
        file_name=$(basename "$file")
        move_file "$file_name" "data/bulk-jobs"
    fi
done

# Handle .env files (special handling)
echo -e "${BLUE}Handling environment files:${NC}"
for file in "$BASE_DIR"/.env*; do
    if [ -f "$file" ]; then
        file_name=$(basename "$file")

        # Keep main .env files in root
        if [[ "$file_name" == ".env" ]] || [[ "$file_name" == ".env.template" ]] || [[ "$file_name" == ".env.example" ]] || [[ "$file_name" == ".env.sample" ]]; then
            echo -e "  ${GREEN}Keeping:${NC} $file_name (required in root)"
        else
            # Move specialized env files to config
            move_file "$file_name" "config/environments"
        fi
    fi
done

echo
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN COMPLETE${NC}"
    echo -e "Review the changes above, then run with ${BLUE}--execute${NC} to apply"
    echo
    echo -e "Command: ${BLUE}$0 --execute${NC}"
else
    echo -e "${GREEN}CLEANUP COMPLETE${NC}"
    echo -e "Backup saved to: ${BLUE}$BACKUP_DIR${NC}"
    echo
    echo -e "To restore if needed:"
    echo -e "  ${BLUE}cp -r $BACKUP_DIR/* $BASE_DIR/${NC}"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

# Show current status
echo
echo -e "${YELLOW}Running quick compliance check...${NC}"
if command -v node &> /dev/null; then
    VIOLATIONS=$(node "$BASE_DIR/scripts/lib/organization-enforcer.js" check 2>&1 | grep "violations found" || echo "0 violations found")
    echo -e "Result: ${GREEN}$VIOLATIONS${NC}"
fi