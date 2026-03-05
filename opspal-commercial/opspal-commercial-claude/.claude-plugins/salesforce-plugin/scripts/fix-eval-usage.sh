#!/bin/bash

##############################################################################
# fix-eval-usage.sh - Safely replace eval usage in shell scripts
##############################################################################
# This script identifies and replaces dangerous eval usage with safer alternatives
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups/eval-fixes-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${SCRIPT_DIR}/eval-fixes.log"

# Scripts with eval usage (from inventory)
SCRIPTS_WITH_EVAL=(
    "validation-rule-manager.sh"
    "error-prevention-guard.sh"
    "safe-bulk-import.sh"
    "job-monitor.sh"
    "test-contract-creation-flow.sh"
    "agent-auto-resolver.sh"
    "test-verification-system.sh"
    "verify-field-accessibility.sh"
    "pre-import-validator.sh"
    "test-auto-fix.sh"
    "lib/salesforce-deployment-utils.sh"
)

# Counter
FIXED_COUNT=0
SKIPPED_COUNT=0

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
    log_message "INFO" "Backed up: $file"
}

fix_eval_in_file() {
    local file="$1"
    local fixed=false
    
    if [[ ! -f "$file" ]]; then
        log_message "WARNING" "File not found: $file"
        ((SKIPPED_COUNT++))
        return 1
    fi
    
    log_message "INFO" "Analyzing: $(basename "$file")"
    
    # Create backup
    create_backup "$file"
    
    # Create temporary file
    local temp_file="${file}.tmp"
    cp "$file" "$temp_file"
    
    # Pattern 1: eval "$cmd" - Replace with direct execution
    if grep -q 'eval "\$[^"]*"' "$file"; then
        sed -i 's/eval "\(\$[^"]*\)"/\1/g' "$temp_file"
        fixed=true
        log_message "SUCCESS" "Fixed: eval \"\$variable\" pattern"
    fi
    
    # Pattern 2: eval $cmd - Replace with direct execution
    if grep -q 'eval \$[a-zA-Z_][a-zA-Z0-9_]*\s*$' "$file"; then
        sed -i 's/eval \(\$[a-zA-Z_][a-zA-Z0-9_]*\)\s*$/\1/g' "$temp_file"
        fixed=true
        log_message "SUCCESS" "Fixed: eval \$variable pattern"
    fi
    
    # Pattern 3: $(eval "$cmd") - Replace with $($cmd)
    if grep -q '\$(eval "\$[^"]*")' "$file"; then
        sed -i 's/\$(eval "\(\$[^"]*\)")/\$(\1)/g' "$temp_file"
        fixed=true
        log_message "SUCCESS" "Fixed: \$(eval \"\$cmd\") pattern"
    fi
    
    # Pattern 4: eval "$command $args" - Replace with $command $args or use array
    if grep -q 'eval "\$[a-zA-Z_][a-zA-Z0-9_]* \$[a-zA-Z_][a-zA-Z0-9_]*"' "$file"; then
        # This is more complex - need to handle case by case
        # For now, we'll flag for manual review
        log_message "WARNING" "Complex eval pattern found - needs manual review"
        
        # Add comment above eval lines for manual review
        sed -i '/eval "\$[a-zA-Z_][a-zA-Z0-9_]* \$[a-zA-Z_][a-zA-Z0-9_]*"/i\
# TODO: Replace eval with safer alternative - use array or direct execution' "$temp_file"
        fixed=true
    fi
    
    # Check for other eval patterns that might need manual review
    if grep 'eval ' "$temp_file" | grep -v '^#' | grep -q .; then
        log_message "WARNING" "Remaining eval usage detected - manual review recommended"
        
        # Add warning comment
        sed -i '1i\
# WARNING: This script still contains eval usage that requires manual review\
# See lines: '"$(grep -n 'eval ' "$temp_file" | grep -v '^#' | cut -d: -f1 | tr '\n' ' ')" "$temp_file"
    fi
    
    if [[ "$fixed" == "true" ]]; then
        # Apply fixes
        mv "$temp_file" "$file"
        ((FIXED_COUNT++))
        log_message "SUCCESS" "Fixed eval usage in: $(basename "$file")"
    else
        rm "$temp_file"
        ((SKIPPED_COUNT++))
        log_message "INFO" "No eval usage found or already fixed: $(basename "$file")"
    fi
}

fix_specific_patterns() {
    log_message "INFO" "Applying specific fixes for known patterns..."
    
    # Fix validation-rule-manager.sh
    if [[ -f "${SCRIPT_DIR}/validation-rule-manager.sh" ]]; then
        sed -i 's/local response=$(eval "$cmd" 2>\/dev\/null)/local response=$($cmd 2>\/dev\/null)/g' \
            "${SCRIPT_DIR}/validation-rule-manager.sh"
        log_message "SUCCESS" "Fixed validation-rule-manager.sh"
    fi
    
    # Fix error-prevention-guard.sh
    if [[ -f "${SCRIPT_DIR}/error-prevention-guard.sh" ]]; then
        sed -i 's/eval "$command $args"/$command $args/g' \
            "${SCRIPT_DIR}/error-prevention-guard.sh"
        log_message "SUCCESS" "Fixed error-prevention-guard.sh"
    fi
    
    # Fix agent-auto-resolver.sh
    if [[ -f "${SCRIPT_DIR}/agent-auto-resolver.sh" ]]; then
        sed -i 's/eval "$protected_command"/$protected_command/g' \
            "${SCRIPT_DIR}/agent-auto-resolver.sh"
        log_message "SUCCESS" "Fixed agent-auto-resolver.sh"
    fi
}

generate_report() {
    echo -e "\n${BLUE}===================================${NC}"
    echo -e "${BLUE}     Eval Usage Fix Report${NC}"
    echo -e "${BLUE}===================================${NC}"
    echo -e "Scripts Fixed: ${GREEN}$FIXED_COUNT${NC}"
    echo -e "Scripts Skipped: ${YELLOW}$SKIPPED_COUNT${NC}"
    echo -e "Backups Created: ${BLUE}${BACKUP_DIR}${NC}"
    echo -e "Log File: ${BLUE}${LOG_FILE}${NC}"
    
    # Check if any eval usage remains
    echo -e "\n${BLUE}Verification:${NC}"
    local remaining=0
    for script in "${SCRIPTS_WITH_EVAL[@]}"; do
        local full_path="${SCRIPT_DIR}/$script"
        if [[ -f "$full_path" ]]; then
            if grep 'eval ' "$full_path" | grep -v '^#' | grep -q .; then
                echo -e "${YELLOW}⚠${NC} $script still contains eval (may need manual review)"
                ((remaining++))
            else
                echo -e "${GREEN}✓${NC} $script is clean"
            fi
        fi
    done
    
    if [[ $remaining -eq 0 ]]; then
        echo -e "\n${GREEN}✓ All eval usage has been fixed!${NC}"
    else
        echo -e "\n${YELLOW}⚠ $remaining scripts still need manual review${NC}"
        echo -e "Review the files marked with TODO comments for complex patterns"
    fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
    log_message "INFO" "Starting eval usage fixes..."
    log_message "INFO" "Creating backup directory: $BACKUP_DIR"
    
    # First apply specific known fixes
    fix_specific_patterns
    
    # Then process all files
    for script in "${SCRIPTS_WITH_EVAL[@]}"; do
        local full_path="${SCRIPT_DIR}/$script"
        fix_eval_in_file "$full_path"
    done
    
    # Generate report
    generate_report
    
    log_message "INFO" "Eval usage fix complete!"
}

# Run main function
main "$@"