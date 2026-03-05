#!/bin/bash
# retrofit-scripts.sh - Retrofits existing scripts to use sf-wrapper and soql-validator
# Instance-agnostic solution for preventing CLI warnings and SOQL errors

SCRIPT_DIR="$(dirname "$0")"
DRY_RUN=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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
            echo "Usage: $0 [OPTIONS] [script-path|directory]"
            echo ""
            echo "Options:"
            echo "  --dry-run    Show what would be changed without making changes"
            echo "  --verbose    Show detailed output"
            echo "  --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 /path/to/script.sh"
            echo "  $0 /path/to/scripts/"
            echo "  $0 --dry-run ."
            exit 0
            ;;
        *)
            TARGET="$1"
            shift
            ;;
    esac
done

# Default to current directory if no target specified
TARGET="${TARGET:-.}"

# Function to log messages
log() {
    if [ "$VERBOSE" = true ]; then
        echo "$1"
    fi
}

# Function to add wrapper source to script
add_wrapper_source() {
    local file="$1"
    local temp_file="${file}.tmp"

    # Check if wrapper is already sourced
    if grep -q "sf-wrapper.sh\|soql-validator.sh" "$file"; then
        log "  Wrapper already sourced in $file"
        return 1
    fi

    # Create the source block to add
    local source_block='# Source instance-agnostic wrappers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}"

# Find lib directory (traverse up if needed)
while [ ! -d "${LIB_DIR}/lib" ] && [ "${LIB_DIR}" != "/" ]; do
    LIB_DIR="$(dirname "${LIB_DIR}")"
done

if [ -d "${LIB_DIR}/lib" ]; then
    LIB_DIR="${LIB_DIR}/lib"
elif [ -d "${SCRIPT_DIR}/../scripts/lib" ]; then
    LIB_DIR="${SCRIPT_DIR}/../scripts/lib"
elif [ -d "${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}" ]; then
    LIB_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
fi

# Source the wrappers
if [ -f "${LIB_DIR}/sf-wrapper.sh" ]; then
    source "${LIB_DIR}/sf-wrapper.sh"
fi
if [ -f "${LIB_DIR}/soql-validator.sh" ]; then
    source "${LIB_DIR}/soql-validator.sh"
fi
'

    # Add after shebang
    awk -v block="$source_block" '
        /^#!/ { print; print ""; print block; next }
        { print }
    ' "$file" > "$temp_file"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}Would add wrapper source to: $file${NC}"
        rm "$temp_file"
    else
        mv "$temp_file" "$file"
        chmod +x "$file"
        echo -e "${GREEN}Added wrapper source to: $file${NC}"
    fi

    return 0
}

# Function to replace sf commands
replace_sf_commands() {
    local file="$1"
    local temp_file="${file}.tmp"
    local changes=0

    cp "$file" "$temp_file"

    # Replace direct sf commands (avoiding already wrapped ones)
    sed -i 's/\bsf data query\b/sf_exec data query/g' "$temp_file"
    sed -i 's/\bsf org\b/sf_exec org/g' "$temp_file"
    sed -i 's/\bsf project\b/sf_exec project/g' "$temp_file"

    # Don't replace if already using wrapper
    sed -i 's/sf_exec_exec/sf_exec/g' "$temp_file"

    # Check if changes were made
    if ! diff -q "$file" "$temp_file" > /dev/null; then
        changes=1
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}Would update SF commands in: $file${NC}"
            if [ "$VERBOSE" = true ]; then
                diff "$file" "$temp_file" | head -20
            fi
        else
            mv "$temp_file" "$file"
            echo -e "${GREEN}Updated SF commands in: $file${NC}"
        fi
    else
        rm "$temp_file"
        log "  No SF command updates needed in $file"
    fi

    return $((1 - changes))
}

# Function to add SOQL validation
add_soql_validation() {
    local file="$1"
    local temp_file="${file}.tmp"

    # Look for SOQL queries and wrap them with validation
    # This is a simplified pattern - you may need to adjust based on your scripts
    if grep -q "SELECT.*FROM\|select.*from" "$file"; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}Would add SOQL validation to: $file${NC}"
        else
            # For now, just flag files that need manual review
            echo -e "${YELLOW}Manual review needed for SOQL queries in: $file${NC}"
        fi
    fi
}

# Function to process a single script
process_script() {
    local script="$1"

    echo "Processing: $script"

    # Skip if not a shell script
    if [[ ! "$script" =~ \.(sh|bash)$ ]] && ! head -1 "$script" | grep -q "^#!/.*sh"; then
        log "  Skipping non-shell script: $script"
        return
    fi

    # Add wrapper source
    add_wrapper_source "$script"

    # Replace SF commands
    replace_sf_commands "$script"

    # Add SOQL validation
    add_soql_validation "$script"

    echo ""
}

# Function to find all shell scripts in directory
find_scripts() {
    local dir="$1"
    find "$dir" -type f \( -name "*.sh" -o -name "*.bash" \) -o -type f -exec grep -l '^#!/.*sh' {} \; 2>/dev/null
}

# Main processing
echo "=== Script Retrofitting Tool ==="
echo "Target: $TARGET"
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
fi
echo ""

if [ -f "$TARGET" ]; then
    # Process single file
    process_script "$TARGET"
elif [ -d "$TARGET" ]; then
    # Process directory
    scripts=$(find_scripts "$TARGET")
    total=$(echo "$scripts" | wc -l)
    current=0

    echo "Found $total scripts to process"
    echo ""

    while IFS= read -r script; do
        [ -z "$script" ] && continue
        ((current++))
        echo "[$current/$total]"
        process_script "$script"
    done <<< "$scripts"
else
    echo -e "${RED}Error: Target not found: $TARGET${NC}"
    exit 1
fi

echo "=== Retrofitting Complete ==="
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}This was a dry run. Use without --dry-run to apply changes.${NC}"
else
    echo -e "${GREEN}Scripts have been updated to use instance-agnostic wrappers.${NC}"
fi

echo ""
echo "Next steps:"
echo "1. Review any scripts marked for manual SOQL review"
echo "2. Test updated scripts in a sandbox environment"
echo "3. Consider adding these to your .bashrc or .bash_profile:"
echo "   export SF_DISABLE_AUTOUPDATE=true"
echo "   export SF_DISABLE_AUTOUPDATE=true"
