#!/bin/bash
# Batch script to fix reserved keyword issues in all SFDC scripts
# This will fix common SOQL reserved keyword issues across all scripts

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DRY_RUN=false
VERBOSE=false
TARGET_DIR="${1:-${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS] [directory]"
            echo ""
            echo "Fixes reserved keyword issues in SOQL queries across all scripts"
            echo ""
            echo "Options:"
            echo "  --dry-run    Show what would be changed without making changes"
            echo "  --verbose    Show detailed output"
            echo "  --help       Show this help message"
            echo ""
            echo "Reserved keywords that will be fixed:"
            echo "  COUNT(Id) Count → COUNT(Id) Count_"
            echo "  SUM(...) Sum → SUM(...) Sum_"
            echo "  AVG(...) Average → AVG(...) Average_"
            echo "  MAX(...) Max → MAX(...) Max_"
            echo "  MIN(...) Min → MIN(...) Min_"
            exit 0
            ;;
        *)
            TARGET_DIR="$1"
            shift
            ;;
    esac
done

echo -e "${BLUE}=== SOQL Reserved Keyword Batch Fixer ===${NC}"
echo "Target directory: $TARGET_DIR"
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}Running in DRY-RUN mode - no changes will be made${NC}"
fi
echo ""

# Counter variables
TOTAL_FILES=0
FIXED_FILES=0
TOTAL_ISSUES=0

# Common reserved keyword patterns to fix
declare -a PATTERNS=(
    # Format: "search_pattern|replacement_pattern|description"
    "COUNT(Id) Count([^_])|COUNT(Id) Count_\1|COUNT alias"
    "COUNT(Id) Count\$|COUNT(Id) Count_|COUNT alias at end"
    "SUM([^)]*) Sum([^_])|SUM\1 Sum_\2|SUM alias"
    "SUM([^)]*) Sum\$|SUM\1 Sum_|SUM alias at end"
    "AVG([^)]*) Average([^_])|AVG\1 Average_\2|AVG alias"
    "AVG([^)]*) Average\$|AVG\1 Average_|AVG alias at end"
    "MAX([^)]*) Max([^_])|MAX\1 Max_\2|MAX alias"
    "MAX([^)]*) Max\$|MAX\1 Max_|MAX alias at end"
    "MIN([^)]*) Min([^_])|MIN\1 Min_\2|MIN alias"
    "MIN([^)]*) Min\$|MIN\1 Min_|MIN alias at end"
    "COUNT([^)]*) AS Count([^_])|COUNT\1 AS Count_\2|COUNT with AS"
    "SUM([^)]*) AS Sum([^_])|SUM\1 AS Sum_\2|SUM with AS"
)

# Function to fix a single file
fix_file() {
    local file="$1"
    local temp_file="${file}.tmp.$$"
    local changes_made=false
    local file_issues=0

    # Skip non-script files
    if [[ ! "$file" =~ \.(sh|bash)$ ]] && ! head -1 "$file" 2>/dev/null | grep -q "^#!/.*sh"; then
        return
    fi

    # Create a copy to work with
    cp "$file" "$temp_file"

    # Apply each pattern
    for pattern_def in "${PATTERNS[@]}"; do
        IFS='|' read -r search replace desc <<< "$pattern_def"

        # Check if pattern exists in file
        if grep -qE "$search" "$temp_file"; then
            if [ "$VERBOSE" = true ]; then
                echo -e "  Found ${desc} issue in: $(basename $file)"
            fi

            # Apply the fix
            sed -i -E "s/${search}/${replace}/g" "$temp_file"
            changes_made=true
            ((file_issues++))
        fi
    done

    # Check if any changes were made
    if [ "$changes_made" = true ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}Would fix $file_issues issue(s) in: ${file}${NC}"
            if [ "$VERBOSE" = true ]; then
                echo "  Changes preview:"
                diff --suppress-common-lines "$file" "$temp_file" | head -10
            fi
            rm "$temp_file"
        else
            # Backup original
            cp "$file" "${file}.backup.$(date +%Y%m%d_%H%M%S)"

            # Apply changes
            mv "$temp_file" "$file"
            chmod --reference="${file}.backup.$(date +%Y%m%d_%H%M%S)" "$file"

            echo -e "${GREEN}Fixed $file_issues issue(s) in: ${file}${NC}"
            ((FIXED_FILES++))
            ((TOTAL_ISSUES+=file_issues))
        fi
    else
        rm "$temp_file"
        if [ "$VERBOSE" = true ]; then
            echo -e "  No issues found in: $(basename $file)"
        fi
    fi

    ((TOTAL_FILES++))
}

# Function to add wrapper source to files
add_wrapper_source() {
    local file="$1"

    # Check if wrapper is already sourced
    if grep -q "sf-wrapper.sh\|soql-validator.sh" "$file"; then
        return
    fi

    # Check if file uses sf commands
    if ! grep -qE "(sf )" "$file"; then
        return
    fi

    local wrapper_block='# Source SF wrapper to suppress update warnings
LIB_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}/scripts/lib"
if [ -f "${LIB_DIR}/sf-wrapper.sh" ]; then
    source "${LIB_DIR}/sf-wrapper.sh"
else
    # Minimal fallback wrapper
    sf_exec() { sf "$@" 2>&1 | grep -v "Warning.*update available"; }
fi
'

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}Would add wrapper source to: ${file}${NC}"
    else
        # Add after shebang
        local temp_file="${file}.tmp.$$"
        awk -v block="$wrapper_block" '
            /^#!/ { print; print ""; print block; next }
            { print }
        ' "$file" > "$temp_file"

        mv "$temp_file" "$file"
        chmod +x "$file"
        echo -e "${BLUE}Added wrapper source to: ${file}${NC}"
    fi
}

# Find all shell scripts
echo "Scanning for shell scripts..."
mapfile -t SCRIPTS < <(find "$TARGET_DIR" -type f \( -name "*.sh" -o -name "*.bash" \) 2>/dev/null)

echo "Found ${#SCRIPTS[@]} shell scripts"
echo ""

# Process each script
for script in "${SCRIPTS[@]}"; do
    # Skip backup files
    if [[ "$script" =~ \.backup\. ]]; then
        continue
    fi

    # Skip lib files themselves
    if [[ "$script" =~ /sf-wrapper\.sh$ ]] || [[ "$script" =~ /soql-validator\.sh$ ]]; then
        continue
    fi

    fix_file "$script"

    # Also add wrapper source if needed
    add_wrapper_source "$script"
done

echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo "Total files scanned: $TOTAL_FILES"
echo "Files fixed: $FIXED_FILES"
echo "Total issues fixed: $TOTAL_ISSUES"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo -e "${YELLOW}This was a dry run. To apply fixes, run without --dry-run${NC}"
else
    echo ""
    echo -e "${GREEN}✓ All fixes applied successfully${NC}"
    echo ""
    echo "Backup files created with .backup.<timestamp> extension"
    echo "To restore a file: mv file.sh.backup.<timestamp> file.sh"
fi

echo ""
echo "Additional recommendations:"
echo "1. Test scripts in sandbox before production use"
echo "2. Add these to your .bashrc:"
echo "   export SF_DISABLE_AUTOUPDATE=true"
echo "   export SF_DISABLE_AUTOUPDATE=true"
echo "3. Consider using the SOQL validator for new queries:"
echo "   source ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}/scripts/lib/soql-validator.sh"
