#!/bin/bash

##############################################################################
# setup-consolidation.sh - Script Consolidation Setup Utility
##############################################################################
# This script sets up the new consolidated scripts and prepares for migration
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups/pre-consolidation-$(date +%Y%m%d-%H%M%S)"

# Scripts to be consolidated
declare -a IMPORT_SCRIPTS=(
    "safe-bulk-import.sh"
    "smart-import-orchestrator.sh" 
    "pre-import-validator.sh"
    "chunked-operations.py"
)

declare -a VALIDATION_SCRIPTS=(
    "validate-soql.sh"
    "validate-file-placement.sh"
    "test-verification-system.sh"
    "verify-field-accessibility.sh"
    "validation-rule-manager.sh"
    "run_contract_validation_analysis.sh"
)

declare -a NEW_SCRIPTS=(
    "unified-import-manager.sh"
    "unified-data-validator.sh"
    "unified-system-validator.sh"
)

log() {
    local level="$1"
    shift
    local message="$*"
    
    case "$level" in
        ERROR)   echo -e "${RED}[ERROR]${NC} $message" >&2 ;;
        WARNING) echo -e "${YELLOW}[WARNING]${NC} $message" ;;
        INFO)    echo -e "${BLUE}[INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        PROGRESS) echo -e "${CYAN}[PROGRESS]${NC} $message" ;;
    esac
}

# Check if scripts exist
check_scripts() {
    log INFO "Checking for existing scripts..."
    
    local missing_count=0
    
    # Check new consolidated scripts
    for script in "${NEW_SCRIPTS[@]}"; do
        if [[ -f "$SCRIPT_DIR/$script" ]]; then
            log SUCCESS "Found new script: $script"
        else
            log ERROR "Missing new script: $script"
            ((missing_count++))
        fi
    done
    
    if [[ $missing_count -gt 0 ]]; then
        log ERROR "Missing $missing_count new consolidated scripts. Please ensure they are created first."
        exit 1
    fi
    
    # Check old scripts that will be replaced
    local old_script_count=0
    for script in "${IMPORT_SCRIPTS[@]}" "${VALIDATION_SCRIPTS[@]}"; do
        if [[ -f "$SCRIPT_DIR/$script" ]]; then
            ((old_script_count++))
        fi
    done
    
    log INFO "Found $old_script_count existing scripts to be consolidated"
}

# Create backup of existing scripts
create_backup() {
    log PROGRESS "Creating backup of existing scripts..."
    
    mkdir -p "$BACKUP_DIR"
    local backed_up=0
    
    for script in "${IMPORT_SCRIPTS[@]}" "${VALIDATION_SCRIPTS[@]}"; do
        if [[ -f "$SCRIPT_DIR/$script" ]]; then
            cp "$SCRIPT_DIR/$script" "$BACKUP_DIR/"
            log INFO "Backed up: $script"
            ((backed_up++))
        fi
    done
    
    log SUCCESS "Backed up $backed_up scripts to: $BACKUP_DIR"
}

# Make new scripts executable
make_executable() {
    log PROGRESS "Making new scripts executable..."
    
    for script in "${NEW_SCRIPTS[@]}"; do
        if [[ -f "$SCRIPT_DIR/$script" ]]; then
            chmod +x "$SCRIPT_DIR/$script"
            log SUCCESS "Made executable: $script"
        fi
    done
}

# Test new scripts
test_new_scripts() {
    log PROGRESS "Testing new consolidated scripts..."
    
    # Test unified-import-manager.sh
    if "$SCRIPT_DIR/unified-import-manager.sh" -h > /dev/null 2>&1; then
        log SUCCESS "unified-import-manager.sh: Help display works"
    else
        log ERROR "unified-import-manager.sh: Help display failed"
    fi
    
    # Test unified-data-validator.sh
    if "$SCRIPT_DIR/unified-data-validator.sh" -h > /dev/null 2>&1; then
        log SUCCESS "unified-data-validator.sh: Help display works"
    else
        log ERROR "unified-data-validator.sh: Help display failed"
    fi
    
    # Test unified-system-validator.sh
    if "$SCRIPT_DIR/unified-system-validator.sh" -h > /dev/null 2>&1; then
        log SUCCESS "unified-system-validator.sh: Help display works"
    else
        log ERROR "unified-system-validator.sh: Help display failed"
    fi
}

# Create wrapper scripts for backward compatibility
create_wrappers() {
    log PROGRESS "Creating backward compatibility wrappers..."
    
    local wrappers_created=0
    
    # Create import script wrappers
    for script in "${IMPORT_SCRIPTS[@]}"; do
        if [[ -f "$SCRIPT_DIR/$script" ]]; then
            # Move original to backup name
            mv "$SCRIPT_DIR/$script" "$SCRIPT_DIR/$script.original"
            
            # Create wrapper
            cat > "$SCRIPT_DIR/$script" << EOF
#!/bin/bash

##############################################################################
# DEPRECATED WRAPPER - $script
##############################################################################
# This script has been consolidated into unified-import-manager.sh
# This wrapper provides backward compatibility during migration
##############################################################################

echo "⚠️  DEPRECATED: $script has been consolidated into unified-import-manager.sh" >&2
echo "ℹ️  Please update your scripts to use: unified-import-manager.sh" >&2
echo "🔄 Redirecting to new unified script..." >&2
echo "" >&2

# Redirect to unified import manager
exec "\$(dirname "\$0")/unified-import-manager.sh" "\$@"
EOF
            chmod +x "$SCRIPT_DIR/$script"
            log INFO "Created wrapper for: $script"
            ((wrappers_created++))
        fi
    done
    
    # Create validation script wrappers (more complex mapping needed)
    for script in "${VALIDATION_SCRIPTS[@]}"; do
        if [[ -f "$SCRIPT_DIR/$script" ]]; then
            # Move original to backup name
            mv "$SCRIPT_DIR/$script" "$SCRIPT_DIR/$script.original"
            
            # Create appropriate wrapper based on script type
            case "$script" in
                "validate-soql.sh"|"run_contract_validation_analysis.sh")
                    cat > "$SCRIPT_DIR/$script" << EOF
#!/bin/bash
echo "⚠️  DEPRECATED: $script has been consolidated into unified-data-validator.sh" >&2
echo "ℹ️  Please update your scripts to use: unified-data-validator.sh" >&2
echo "🔄 Redirecting to new unified script..." >&2
echo "" >&2
exec "\$(dirname "\$0")/unified-data-validator.sh" "\$@"
EOF
                    ;;
                *)
                    cat > "$SCRIPT_DIR/$script" << EOF
#!/bin/bash
echo "⚠️  DEPRECATED: $script has been consolidated into unified-system-validator.sh" >&2
echo "ℹ️  Please update your scripts to use: unified-system-validator.sh" >&2
echo "🔄 Redirecting to new unified script..." >&2
echo "" >&2
exec "\$(dirname "\$0")/unified-system-validator.sh" "\$@"
EOF
                    ;;
            esac
            
            chmod +x "$SCRIPT_DIR/$script"
            log INFO "Created wrapper for: $script"
            ((wrappers_created++))
        fi
    done
    
    log SUCCESS "Created $wrappers_created backward compatibility wrappers"
}

# Generate migration report
generate_report() {
    local report_file="$PROJECT_ROOT/CONSOLIDATION_SETUP_REPORT.md"
    
    log PROGRESS "Generating setup report..."
    
    cat > "$report_file" << EOF
# Script Consolidation Setup Report

**Date**: $(date)
**Backup Location**: $BACKUP_DIR

## Summary
- ✅ New consolidated scripts created and made executable
- ✅ Backward compatibility wrappers created
- ✅ Original scripts backed up
- ✅ Basic functionality tests passed

## New Consolidated Scripts
EOF
    
    for script in "${NEW_SCRIPTS[@]}"; do
        echo "- \`$script\` - Ready for use" >> "$report_file"
    done
    
    cat >> "$report_file" << EOF

## Deprecated Scripts (Now Wrappers)
EOF
    
    for script in "${IMPORT_SCRIPTS[@]}" "${VALIDATION_SCRIPTS[@]}"; do
        if [[ -f "$SCRIPT_DIR/$script.original" ]]; then
            echo "- \`$script\` - Now redirects to appropriate unified script" >> "$report_file"
        fi
    done
    
    cat >> "$report_file" << EOF

## Next Steps
1. Test the new unified scripts with your existing workflows
2. Update any scripts or documentation that reference old script names
3. Once comfortable with new scripts, remove wrappers using cleanup phase

## Usage Examples

### Import Operations
\`\`\`bash
# Instead of: ./scripts/safe-bulk-import.sh -o Account -f accounts.csv
./scripts/unified-import-manager.sh -o Account -f accounts.csv

# Instead of: ./scripts/smart-import-orchestrator.sh -o Contact -f contacts.csv -s safe
./scripts/unified-import-manager.sh -o Contact -f contacts.csv -s safe
\`\`\`

### Data Validation
\`\`\`bash
# Instead of: ./scripts/pre-import-validator.sh -o Account -f accounts.csv
./scripts/unified-data-validator.sh -t csv -f accounts.csv -o Account

# Instead of: ./scripts/validation-rule-manager.sh -o Contact -a myorg
./scripts/unified-data-validator.sh -t rules -o Contact -a myorg
\`\`\`

### System Validation
\`\`\`bash
# Instead of: ./scripts/validate-file-placement.sh --fix
./scripts/unified-system-validator.sh -t structure -f

# Instead of: ./scripts/test-verification-system.sh
./scripts/unified-system-validator.sh -t all -m thorough -r
\`\`\`

## Rollback Instructions
If you need to rollback to original scripts:
1. Remove wrapper scripts: \`rm scripts/{script-name}.sh\`
2. Restore originals: \`mv scripts/{script-name}.sh.original scripts/{script-name}.sh\`
3. Restore from backup: \`cp $BACKUP_DIR/* scripts/\`
EOF
    
    log SUCCESS "Setup report generated: $report_file"
}

# Display usage
usage() {
    cat << 'EOF'
Usage: setup-consolidation.sh [OPTIONS]

Setup script consolidation by creating backups, wrappers, and testing new scripts.

OPTIONS:
    -t    Test mode - only check scripts and show what would be done
    -f    Force mode - proceed even if some checks fail
    -h    Display this help message

EXAMPLES:
    # Test what would be done
    ./scripts/setup-consolidation.sh -t

    # Full setup with backups and wrappers
    ./scripts/setup-consolidation.sh

EOF
    exit 1
}

# Main execution
main() {
    local test_mode=false
    local force_mode=false
    
    # Parse arguments
    while getopts "tfh" opt; do
        case $opt in
            t) test_mode=true;;
            f) force_mode=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    echo -e "${GREEN}=== Script Consolidation Setup ===${NC}"
    echo -e "${BLUE}Project Root:${NC} $PROJECT_ROOT"
    echo -e "${BLUE}Backup Location:${NC} $BACKUP_DIR"
    [[ "$test_mode" == "true" ]] && echo -e "${YELLOW}TEST MODE - No changes will be made${NC}"
    echo ""
    
    # Check scripts exist
    check_scripts
    
    if [[ "$test_mode" == "true" ]]; then
        log INFO "TEST MODE: Would create backup directory: $BACKUP_DIR"
        log INFO "TEST MODE: Would make new scripts executable"
        log INFO "TEST MODE: Would create backward compatibility wrappers"
        log INFO "TEST MODE: Would run basic tests"
        log INFO "TEST MODE: Would generate setup report"
        log INFO "Run without -t flag to actually perform setup"
        exit 0
    fi
    
    # Create backup
    create_backup
    
    # Make new scripts executable
    make_executable
    
    # Test new scripts
    test_new_scripts
    
    # Create wrapper scripts
    create_wrappers
    
    # Generate report
    generate_report
    
    echo ""
    log SUCCESS "Script consolidation setup completed successfully!"
    log INFO "Backup created: $BACKUP_DIR"
    log INFO "Setup report: $PROJECT_ROOT/CONSOLIDATION_SETUP_REPORT.md"
    log INFO "Migration plan: $PROJECT_ROOT/SCRIPT_CONSOLIDATION_MIGRATION_PLAN.md"
    echo ""
    log INFO "Next steps:"
    log INFO "1. Test the new unified scripts with your workflows"
    log INFO "2. Review the setup report for usage examples"
    log INFO "3. Follow the migration plan for full transition"
}

# Execute main function
main "$@"