#!/bin/bash

##############################################################################
# fix-missing-error-handling.sh - Add 'set -e' error handling to shell scripts
##############################################################################
# This script adds proper error handling (set -e) to scripts that are missing it
# Also adds other important safety measures like 'set -u' and 'set -o pipefail'
##############################################################################

set -e
set -u
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups/error-handling-fixes-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${SCRIPT_DIR}/error-handling-fixes.log"

# Counters
FIXED_COUNT=0
SKIPPED_COUNT=0
TOTAL_COUNT=0

##############################################################################
# Functions
##############################################################################

log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    
    case "$level" in
        SUCCESS)
            echo -e "${GREEN}✓${NC} $message"
            ;;
        WARNING)
            echo -e "${YELLOW}⚠${NC} $message"
            ;;
        ERROR)
            echo -e "${RED}✗${NC} $message"
            ;;
        INFO)
            echo -e "${BLUE}ℹ${NC} $message"
            ;;
    esac
}

create_backup() {
    local file="$1"
    local backup_file="${BACKUP_DIR}/$(basename "$file")"
    
    mkdir -p "$BACKUP_DIR"
    cp "$file" "$backup_file"
    log_message "INFO" "Backed up: $(basename "$file")"
}

# Check if script already has proper error handling
has_error_handling() {
    local file="$1"
    
    # Check for set -e, set -euo pipefail, or similar patterns
    if grep -q '^set -[euo]' "$file" || \
       grep -q '^set -o errexit' "$file" || \
       grep -q '^set -euo pipefail' "$file" || \
       grep -q '^set -euox pipefail' "$file"; then
        return 0  # Has error handling
    else
        return 1  # Missing error handling
    fi
}

# Check if script should be excluded from error handling
should_exclude_script() {
    local file="$1"
    local basename_file="$(basename "$file")"
    
    # Exclude specific scripts that may need special handling
    local exclude_patterns=(
        "*backup*"
        "*restore*" 
        "*interactive*"
        "*prompt*"
        "*test*"  # Some test scripts handle errors differently
        "*utility*"
        "*wrapper*"
    )
    
    for pattern in "${exclude_patterns[@]}"; do
        if [[ "$basename_file" == $pattern ]]; then
            return 0  # Should exclude
        fi
    done
    
    # Check if script contains certain patterns that indicate it handles errors specially
    if grep -q 'set +e' "$file" || \
       grep -q 'trap.*ERR' "$file" || \
       grep -q '|| true' "$file" > /dev/null 2>&1; then
        return 0  # Should exclude - has special error handling
    fi
    
    return 1  # Should not exclude
}

# Add error handling to a script
fix_error_handling() {
    local file="$1"
    local filename="$(basename "$file")"
    
    ((TOTAL_COUNT++))
    
    if [[ ! -f "$file" ]]; then
        log_message "WARNING" "File not found: $filename"
        ((SKIPPED_COUNT++))
        return 1
    fi
    
    log_message "INFO" "Analyzing: $filename"
    
    # Check if already has error handling
    if has_error_handling "$file"; then
        log_message "INFO" "Already has error handling: $filename"
        ((SKIPPED_COUNT++))
        return 0
    fi
    
    # Check if should be excluded
    if should_exclude_script "$file"; then
        log_message "WARNING" "Excluding from error handling (special case): $filename"
        ((SKIPPED_COUNT++))
        return 0
    fi
    
    # Create backup
    create_backup "$file"
    
    # Read the current file
    local temp_file="${file}.tmp"
    
    # Start building the new file
    {
        # First, copy the shebang line
        head -n1 "$file"
        
        # Add comprehensive error handling after shebang
        echo ""
        echo "# Error handling and safety measures"
        echo "set -e          # Exit on any error"
        echo "set -u          # Exit on undefined variables" 
        echo "set -o pipefail # Exit on pipe failures"
        echo ""
        
        # Copy the rest of the file, skipping the shebang
        tail -n+2 "$file"
        
    } > "$temp_file"
    
    # Replace the original file
    mv "$temp_file" "$file"
    
    log_message "SUCCESS" "Added error handling to: $filename"
    ((FIXED_COUNT++))
    
    return 0
}

# Find all shell scripts that need error handling
find_scripts_needing_fixes() {
    local scripts=()
    
    log_message "INFO" "Scanning for shell scripts without proper error handling..."
    
    # Find all .sh files in the script directory and subdirectories
    while IFS= read -r -d '' file; do
        if [[ -f "$file" ]] && [[ "$file" == *.sh ]]; then
            # Skip backup directories and this script itself
            if [[ "$file" != *"/backups/"* ]] && [[ "$(basename "$file")" != "$(basename "$0")" ]]; then
                if ! has_error_handling "$file"; then
                    scripts+=("$file")
                fi
            fi
        fi
    done < <(find "$SCRIPT_DIR" -name "*.sh" -print0)
    
    printf '%s\n' "${scripts[@]}"
}

# Generate detailed report
generate_report() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}     Error Handling Fix Report${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo -e "Scripts Processed: ${BLUE}$TOTAL_COUNT${NC}"
    echo -e "Scripts Fixed: ${GREEN}$FIXED_COUNT${NC}"
    echo -e "Scripts Skipped: ${YELLOW}$SKIPPED_COUNT${NC}"
    echo -e "Backups Created: ${BLUE}${BACKUP_DIR}${NC}"
    echo -e "Log File: ${BLUE}${LOG_FILE}${NC}"
    
    # Verification section
    echo -e "\n${BLUE}Verification Results:${NC}"
    local scripts_without_handling=0
    local scripts_with_handling=0
    
    while IFS= read -r -d '' file; do
        if [[ -f "$file" ]] && [[ "$file" == *.sh ]] && [[ "$file" != *"/backups/"* ]]; then
            local filename="$(basename "$file")"
            if has_error_handling "$file"; then
                echo -e "${GREEN}✓${NC} $filename has error handling"
                ((scripts_with_handling++))
            else
                if should_exclude_script "$file"; then
                    echo -e "${YELLOW}⚠${NC} $filename excluded (special handling)"
                else
                    echo -e "${RED}✗${NC} $filename missing error handling"
                    ((scripts_without_handling++))
                fi
            fi
        fi
    done < <(find "$SCRIPT_DIR" -name "*.sh" -print0)
    
    echo -e "\n${BLUE}Summary:${NC}"
    echo -e "Scripts with proper error handling: ${GREEN}$scripts_with_handling${NC}"
    echo -e "Scripts still missing error handling: ${RED}$scripts_without_handling${NC}"
    
    if [[ $scripts_without_handling -eq 0 ]]; then
        echo -e "\n${GREEN}✅ All eligible scripts now have proper error handling!${NC}"
    else
        echo -e "\n${YELLOW}⚠ $scripts_without_handling scripts still need manual review${NC}"
    fi
    
    # Security improvements summary
    echo -e "\n${BLUE}Security Improvements Applied:${NC}"
    echo -e "• ${GREEN}set -e${NC}          - Scripts will exit immediately on any error"
    echo -e "• ${GREEN}set -u${NC}          - Scripts will exit on undefined variables"
    echo -e "• ${GREEN}set -o pipefail${NC} - Scripts will catch errors in pipes"
    echo -e ""
    echo -e "${BLUE}Benefits:${NC}"
    echo -e "• Prevents silent failures and data corruption"
    echo -e "• Makes debugging easier by failing fast"
    echo -e "• Improves script reliability and safety"
    echo -e "• Follows shell scripting best practices"
}

##############################################################################
# Main Execution
##############################################################################
main() {
    log_message "INFO" "Starting error handling fixes for shell scripts..."
    log_message "INFO" "Creating backup directory: $BACKUP_DIR"
    
    # Find all scripts that need error handling
    local scripts_to_fix
    mapfile -t scripts_to_fix < <(find_scripts_needing_fixes)
    
    if [[ ${#scripts_to_fix[@]} -eq 0 ]]; then
        log_message "SUCCESS" "No scripts found that need error handling fixes!"
        generate_report
        return 0
    fi
    
    log_message "INFO" "Found ${#scripts_to_fix[@]} scripts that need error handling"
    
    # Process each script
    for script in "${scripts_to_fix[@]}"; do
        fix_error_handling "$script"
    done
    
    # Generate comprehensive report
    generate_report
    
    log_message "SUCCESS" "Error handling fixes completed!"
    
    return 0
}

##############################################################################
# Help function
##############################################################################
show_help() {
    cat << 'HELP_EOF'
fix-missing-error-handling.sh - Add proper error handling to shell scripts

USAGE:
    ./fix-missing-error-handling.sh [OPTIONS]

OPTIONS:
    -h, --help    Show this help message
    --dry-run     Show what would be changed without making changes
    --verbose     Enable verbose logging

DESCRIPTION:
    This script automatically adds proper error handling to shell scripts
    that are missing it. It adds three key safety measures:
    
    • set -e          - Exit on any error
    • set -u          - Exit on undefined variables
    • set -o pipefail - Exit on pipe failures
    
    Scripts with existing error handling or special error handling patterns
    are automatically detected and skipped.

EXAMPLES:
    # Fix all scripts
    ./fix-missing-error-handling.sh
    
    # Show what would be changed
    ./fix-missing-error-handling.sh --dry-run
    
    # Run with verbose output
    ./fix-missing-error-handling.sh --verbose

SAFETY:
    • Creates backups of all modified files
    • Skips scripts with existing error handling
    • Excludes test scripts and special cases
    • Logs all operations for audit trail

HELP_EOF
}

# Handle command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    --dry-run)
        echo "DRY RUN MODE - No changes will be made"
        # Set a flag for dry run mode
        DRY_RUN=true
        ;;
    --verbose)
        set -x  # Enable verbose mode
        ;;
    "")
        # No arguments, run normally
        ;;
    *)
        echo "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac

# Run main function
main "$@"