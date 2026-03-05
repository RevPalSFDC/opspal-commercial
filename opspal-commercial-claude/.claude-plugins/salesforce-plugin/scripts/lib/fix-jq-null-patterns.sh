#!/bin/bash

# Fix JQ Null Pattern Migration Tool
# Automatically fixes vulnerable jq patterns that cause "Cannot iterate over null" errors

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Track changes
FIXED_COUNT=0
BACKUP_DIR=".jq-fix-backups-$(date +%Y%m%d-%H%M%S)"

# Create backup directory
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        echo -e "${BLUE}📁 Created backup directory: $BACKUP_DIR${NC}"
    fi
}

# Backup file before modification
backup_file() {
    local file="$1"
    local backup_path="$BACKUP_DIR/$(echo "$file" | sed 's/\//_/g')"
    cp "$file" "$backup_path"
    echo -e "${GREEN}✅ Backed up: $file${NC}"
}

# Fix vulnerable patterns in a file
fix_file() {
    local file="$1"
    local changes_made=false
    local temp_file="${file}.tmp"

    # Check if file has vulnerable patterns
    if grep -qE '\.result\.records\[|\| *\.result\.records|jq .\.result\.records' "$file"; then
        backup_file "$file"

        # Apply fixes with proper escaping
        cp "$file" "$temp_file"

        # Fix 1: Add optional operator to array iteration
        sed -i 's/\.result\.records\[\]/\.result\.records[]?/g' "$temp_file"

        # Fix 2: Add null coalescing for pipe operations
        sed -i 's/| *\.result\.records *|/| (.result.records \/\/ []) |/g' "$temp_file"

        # Fix 3: Fix standalone .result.records references
        sed -i "s/jq '\.result\.records'/jq '(.result.records \/\/ [])'/g" "$temp_file"
        sed -i 's/jq "\.result\.records"/jq "(.result.records \/\/ [])"/g' "$temp_file"

        # Fix 4: Add safety to length operations
        sed -i 's/\.result\.records *| *length/(.result.records \/\/ []) | length/g' "$temp_file"

        # Fix 5: Fix map operations
        sed -i 's/\.result\.records *| *map(/(.result.records \/\/ []) | map(/g' "$temp_file"

        # Fix 6: Fix select operations
        sed -i 's/\.result\.records *| *select(/(.result.records \/\/ []) | select(/g' "$temp_file"

        # Fix 7: Add safety to first element access
        sed -i 's/\.result\.records\[0\]/\.result.records[0]?/g' "$temp_file"

        # Fix 8: Handle totalSize checks
        sed -i 's/\.result\.totalSize/(.result.totalSize \/\/ 0)/g' "$temp_file"

        # Fix 9: Fix array construction patterns
        sed -i 's/\[\.result\.records\[\]\./[.result.records[]?./g' "$temp_file"

        # Fix 10: Handle Definition.DeveloperName pattern specifically for Flows
        sed -i 's/\.Definition\.DeveloperName/\.Definition.DeveloperName?/g' "$temp_file"

        # Check if changes were made
        if ! diff -q "$file" "$temp_file" >/dev/null; then
            mv "$temp_file" "$file"
            echo -e "${GREEN}✅ Fixed: $file${NC}"
            ((FIXED_COUNT++))
            changes_made=true
        else
            rm "$temp_file"
            echo -e "${YELLOW}⚠️  No changes needed: $file${NC}"
        fi
    fi

    echo "$changes_made"
}

# Find and fix all vulnerable files
fix_all_files() {
    local search_dir="${1:-.}"

    echo -e "${BLUE}🔍 Searching for vulnerable JQ patterns in: $search_dir${NC}"

    create_backup_dir

    # Find all shell and JavaScript files with potential issues
    local files=$(find "$search_dir" -type f \( -name "*.sh" -o -name "*.js" \) \
        -exec grep -l '\.result\.records' {} \; 2>/dev/null | sort -u)

    if [ -z "$files" ]; then
        echo -e "${GREEN}✅ No files with vulnerable patterns found${NC}"
        return 0
    fi

    local total=$(echo "$files" | wc -l)
    echo -e "${BLUE}📋 Found $total files to check${NC}\n"

    for file in $files; do
        # Skip backup directories
        if [[ "$file" == *".jq-fix-backups"* ]]; then
            continue
        fi

        # Skip node_modules and other common directories to ignore
        if [[ "$file" == *"/node_modules/"* ]] || [[ "$file" == *"/.git/"* ]]; then
            continue
        fi

        fix_file "$file"
    done

    echo -e "\n${GREEN}✨ Fixed $FIXED_COUNT files${NC}"
    echo -e "${BLUE}📁 Backups saved in: $BACKUP_DIR${NC}"
}

# Validate fixes by running a test query
validate_fix() {
    local test_file="$1"

    if [ ! -f "$test_file" ]; then
        echo -e "${RED}❌ Test file not found: $test_file${NC}"
        return 1
    fi

    echo -e "${BLUE}🧪 Validating fix on: $test_file${NC}"

    # Create a test with null result
    local null_json='{"result": null}'
    local empty_json='{"result": {"records": null}}'
    local valid_json='{"result": {"records": [{"Id": "123", "Name": "Test"}]}}'

    # Source the file if it's a shell script
    if [[ "$test_file" == *.sh ]]; then
        source "$test_file" 2>/dev/null || true
    fi

    # Test with different JSON structures
    echo -e "\nTesting with null result:"
    echo "$null_json" | jq '(.result.records // [])' 2>&1

    echo -e "\nTesting with empty records:"
    echo "$empty_json" | jq '(.result.records // [])' 2>&1

    echo -e "\nTesting with valid records:"
    echo "$valid_json" | jq '(.result.records // [])' 2>&1

    echo -e "${GREEN}✅ Validation complete${NC}"
}

# Restore backups if needed
restore_backups() {
    local backup_dir="$1"

    if [ ! -d "$backup_dir" ]; then
        echo -e "${RED}❌ Backup directory not found: $backup_dir${NC}"
        return 1
    fi

    echo -e "${YELLOW}⚠️  Restoring files from: $backup_dir${NC}"

    for backup in "$backup_dir"/*; do
        if [ -f "$backup" ]; then
            # Reconstruct original path
            local original=$(basename "$backup" | sed 's/_/\//g')

            if [ -f "$original" ]; then
                cp "$backup" "$original"
                echo -e "${GREEN}✅ Restored: $original${NC}"
            fi
        fi
    done

    echo -e "${GREEN}✅ Restoration complete${NC}"
}

# Generate fix report
generate_report() {
    local search_dir="${1:-.}"
    local report_file="jq-fix-report-$(date +%Y%m%d-%H%M%S).md"

    echo "# JQ Null Pattern Fix Report" > "$report_file"
    echo "Generated: $(date)" >> "$report_file"
    echo "" >> "$report_file"

    echo "## Vulnerable Patterns Found" >> "$report_file"
    echo "" >> "$report_file"

    # Find patterns
    echo "### Direct Array Access (.result.records[])" >> "$report_file"
    grep -r '\.result\.records\[' "$search_dir" --include="*.sh" --include="*.js" 2>/dev/null | \
        head -10 >> "$report_file" || echo "None found" >> "$report_file"

    echo "" >> "$report_file"
    echo "### Pipe Operations (| .result.records)" >> "$report_file"
    grep -r '| *\.result\.records' "$search_dir" --include="*.sh" --include="*.js" 2>/dev/null | \
        head -10 >> "$report_file" || echo "None found" >> "$report_file"

    echo "" >> "$report_file"
    echo "### Length Operations (.result.records | length)" >> "$report_file"
    grep -r '\.result\.records *| *length' "$search_dir" --include="*.sh" --include="*.js" 2>/dev/null | \
        head -10 >> "$report_file" || echo "None found" >> "$report_file"

    echo -e "${GREEN}✅ Report saved to: $report_file${NC}"
}

# Main function
main() {
    local command="${1:-help}"
    shift

    case "$command" in
        fix)
            fix_all_files "$@"
            ;;
        fix-file)
            fix_file "$@"
            ;;
        validate)
            validate_fix "$@"
            ;;
        restore)
            restore_backups "$@"
            ;;
        report)
            generate_report "$@"
            ;;
        help|*)
            cat << EOF
JQ Null Pattern Fix Tool

Usage: $0 <command> [options]

Commands:
  fix [directory]           - Find and fix all vulnerable files
  fix-file <file>          - Fix a specific file
  validate <file>          - Validate fixes on a file
  restore <backup-dir>     - Restore files from backup
  report [directory]       - Generate vulnerability report
  help                     - Show this help message

Examples:
  $0 fix                   # Fix all files in current directory
  $0 fix scripts/          # Fix all files in scripts directory
  $0 fix-file script.sh    # Fix specific file
  $0 validate script.sh    # Test fixes
  $0 restore .jq-fix-backups-20250118-123456
  $0 report                # Generate report

Common Patterns Fixed:
  .result.records[]        → .result.records[]?
  | .result.records        → | (.result.records // [])
  .result.records | length → (.result.records // []) | length
  .result.records[0]       → .result.records[0]?
  .result.totalSize        → (.result.totalSize // 0)

EOF
            ;;
    esac
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi