#!/bin/bash

# Script to fix hardcoded paths after directory reorganization
# Created: 2025-09-11

set -e

echo "========================================="
echo "Fixing Hardcoded Paths After Reorganization"
echo "========================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="/home/chris/Desktop/RevPal/Agents"
SFDC_DIR="$BASE_DIR/platforms/SFDC"

# Counter for fixed files
FIXED_COUNT=0

# Function to fix a file
fix_file() {
    local file=$1
    local old_pattern=$2
    local new_pattern=$3
    
    if [ -f "$file" ]; then
        if grep -q "$old_pattern" "$file" 2>/dev/null; then
            echo -e "${YELLOW}Fixing: $file${NC}"
            sed -i.backup "s|$old_pattern|$new_pattern|g" "$file" 2>/dev/null || true
            ((FIXED_COUNT++)) || true
            echo -e "${GREEN}✓ Fixed${NC}"
        fi
    else
        echo -e "${RED}Warning: File not found: $file${NC}"
    fi
}

echo -e "\n${YELLOW}Step 1: Fixing ClaudeSFDC references...${NC}"

# Fix all ClaudeSFDC references to platforms/SFDC
find "$SFDC_DIR" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.py" \) | while read file; do
    fix_file "$file" "/ClaudeSFDC/" "/platforms/SFDC/"
    fix_file "$file" "ClaudeSFDC/" "platforms/SFDC/"
done

echo -e "\n${YELLOW}Step 2: Fixing specific script paths...${NC}"

# Fix specific files identified in audit
fix_file "$SFDC_DIR/tests/test-flexipage-validator.js" \
    "./instances/peregrine-staging" \
    "./platforms/SFDC/instances/peregrine-staging"

fix_file "$SFDC_DIR/scripts/validate-file-placement.sh" \
    '"/instances/"' \
    '"/platforms/SFDC/instances/"'

fix_file "$SFDC_DIR/scripts/validate-file-placement.sh" \
    ".salesforce-instances" \
    ".sfdc-instances"

echo -e "\n${YELLOW}Step 3: Fixing instance path patterns...${NC}"

# Fix patterns that check for /instances/ in paths
find "$SFDC_DIR" -type f -name "*.sh" | while read file; do
    fix_file "$file" '*/instances/*' '*/platforms/SFDC/instances/*'
    fix_file "$file" '"instances/' '"platforms/SFDC/instances/'
done

echo -e "\n${YELLOW}Step 4: Creating symlinks for backward compatibility...${NC}"

# Create symlinks for backward compatibility (optional)
if [ ! -L "$BASE_DIR/ClaudeSFDC" ]; then
    ln -s "$SFDC_DIR" "$BASE_DIR/ClaudeSFDC"
    echo -e "${GREEN}✓ Created symlink: ClaudeSFDC -> platforms/SFDC${NC}"
fi

if [ ! -L "$BASE_DIR/instances" ]; then
    ln -s "$SFDC_DIR/instances" "$BASE_DIR/instances"
    echo -e "${GREEN}✓ Created symlink: instances -> platforms/SFDC/instances${NC}"
fi

echo -e "\n${YELLOW}Step 5: Verifying fixes...${NC}"

# Verify no more old paths exist
echo "Checking for remaining old paths..."

OLD_REFS=$(grep -r "ClaudeSFDC" "$SFDC_DIR" --exclude="*.backup" --exclude-dir=.git 2>/dev/null | wc -l)
if [ $OLD_REFS -gt 0 ]; then
    echo -e "${YELLOW}Warning: Found $OLD_REFS remaining references to 'ClaudeSFDC'${NC}"
    echo "Run this command to see them:"
    echo "  grep -r 'ClaudeSFDC' $SFDC_DIR --exclude='*.backup' --exclude-dir=.git"
else
    echo -e "${GREEN}✓ No remaining 'ClaudeSFDC' references found${NC}"
fi

echo -e "\n========================================="
echo -e "${GREEN}Completed! Fixed $FIXED_COUNT files${NC}"
echo -e "========================================="
echo ""
echo "Backup files created with .backup extension"
echo "To remove backups after verification:"
echo "  find $SFDC_DIR -name '*.backup' -delete"
echo ""
echo "Symlinks created for backward compatibility:"
echo "  ClaudeSFDC -> platforms/SFDC"
echo "  instances -> platforms/SFDC/instances"