#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# Pre-Picklist-Dependency Validation Hook
# ========================================
#
# Automatically validates picklist field dependencies before deployment
# to prevent common errors and configuration issues.
#
# Triggers on:
# - sf project deploy start (with field metadata)
# - sf data create on GlobalValueSet (Tooling API)
#
# Validation Checks:
# - Detects picklist fields in deployment
# - Checks for controllingField attribute
# - Validates dependency matrix structure
# - Verifies record type metadata included
# - Blocks deployment on critical errors
#
# Exit Codes:
# - 0: Validation passed or not applicable
# - 1: Critical validation error (blocks deployment)
# - 2: Warning (allows deployment with message)
#
# Configuration:
# - PICKLIST_VALIDATION_ENABLED (default: true)
# - PICKLIST_VALIDATION_STRICT (default: false)
#
##############################################################################

# Configuration
PICKLIST_VALIDATION_ENABLED="${PICKLIST_VALIDATION_ENABLED:-true}"
PICKLIST_VALIDATION_STRICT="${PICKLIST_VALIDATION_STRICT:-false}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../scripts/lib"

# Load stop prompt helper
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PLUGIN_ROOT/scripts/lib/hook-stop-prompt-helper.sh"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if validation is enabled
if [ "$PICKLIST_VALIDATION_ENABLED" = "false" ]; then
    exit 0
fi

# Parse command from arguments
COMMAND="${1:-}"
shift
ARGS=("$@")

# Function to print colored messages
print_error() {
    echo -e "${RED}❌ ERROR: $1${NC}" >&2
}

print_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}" >&2
}

print_info() {
    echo -e "${BLUE}ℹ️  INFO: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to detect if deployment contains picklist fields
detect_picklist_fields() {
    local manifest_path="$1"
    local deploy_dir="$2"

    # Check if manifest exists
    if [ ! -f "$manifest_path" ]; then
        return 1
    fi

    # Look for CustomField in package.xml
    if ! grep -q "<name>CustomField</name>" "$manifest_path"; then
        return 1
    fi

    # Extract field names from manifest
    local field_members=$(grep -A 1 "<name>CustomField</name>" "$manifest_path" | grep "<members>" | sed 's/<[^>]*>//g' | tr -d '[:space:]')

    if [ -z "$field_members" ]; then
        return 1
    fi

    # Check if any of the fields are picklist fields (look for .field-meta.xml files)
    local has_picklist=false

    # Search for field metadata files in deployment directory
    if [ -d "$deploy_dir" ]; then
        while IFS= read -r field_file; do
            # Check if file contains picklist or multipicklist type
            if grep -q -E "<type>(picklist|multipicklist)</type>" "$field_file" 2>/dev/null; then
                has_picklist=true
                break
            fi
        done < <(find "$deploy_dir" -name "*.field-meta.xml" -type f)
    fi

    if [ "$has_picklist" = true ]; then
        return 0
    else
        return 1
    fi
}

# Function to check for controlling field dependencies
check_controlling_field() {
    local field_file="$1"

    # Check if field has controllingField attribute
    if grep -q "<controllingField>" "$field_file"; then
        return 0
    else
        return 1
    fi
}

# Function to validate dependency structure
validate_dependency_structure() {
    local field_file="$1"
    local errors=()

    # Check for controllingField attribute
    if ! grep -q "<controllingField>" "$field_file"; then
        errors+=("Missing controllingField attribute")
    fi

    # Check for valueSettings array
    if ! grep -q "<valueSettings>" "$field_file"; then
        errors+=("Missing valueSettings array - dependency matrix not defined")
    fi

    # Check for valueSetDefinition (field must have values)
    if ! grep -q "<valueSetDefinition>" "$field_file"; then
        # Check if using global value set
        if ! grep -q "<valueSetName>" "$field_file"; then
            errors+=("Field has no values defined (neither valueSetDefinition nor valueSetName)")
        fi
    fi

    # Return errors
    if [ ${#errors[@]} -gt 0 ]; then
        for error in "${errors[@]}"; do
            print_error "$error"
        done
        return 1
    fi

    return 0
}

# Function to check record type metadata
check_record_type_metadata() {
    local manifest_path="$1"
    local deploy_dir="$2"
    local field_api_name="$3"

    # Check if RecordType metadata is included in deployment
    if ! grep -q "<name>RecordType</name>" "$manifest_path" 2>/dev/null; then
        print_warning "RecordType metadata not included in deployment"
        print_warning "Picklist values may not be visible on record types"
        print_info "Consider using PicklistDependencyManager which handles record types automatically"
        return 2  # Warning, not error
    fi

    return 0
}

# Function to run Node.js validator if available
run_node_validator() {
    local org="$1"
    local object_name="$2"
    local controlling_field="$3"
    local dependent_field="$4"

    # Check if Node.js validator exists (dependent-picklist-validator.js)
    if [ ! -f "${LIB_DIR}/dependent-picklist-validator.js" ]; then
        print_info "Node.js validator not found, skipping advanced validation"
        return 0
    fi

    print_info "Running comprehensive validation via dependent-picklist-validator.js..."

    # Run the validator if object and dependent field are known
    if [ -n "$org" ] && [ -n "$object_name" ] && [ -n "$dependent_field" ]; then
        local result
        result=$(node "${LIB_DIR}/dependent-picklist-validator.js" dependencies "$object_name" --org "$org" 2>&1)

        if [ $? -eq 0 ]; then
            print_success "Dependency validation completed"
            echo "$result"
        else
            print_error "Dependency validation failed"
            echo "$result"
            return 1
        fi
    else
        # Provide manual command for user
        print_info "To run comprehensive validation manually:"
        print_info "  node ${LIB_DIR}/dependent-picklist-validator.js dependencies $object_name --org $org"
    fi

    return 0
}

# Main validation logic
validate_deployment() {
    local manifest_path=""
    local deploy_dir=""
    local org=""

    # Parse arguments to find manifest and deploy directory
    for ((i=0; i<${#ARGS[@]}; i++)); do
        case "${ARGS[$i]}" in
            --manifest|-x)
                manifest_path="${ARGS[$((i+1))]}"
                ;;
            --source-dir|-d)
                deploy_dir="${ARGS[$((i+1))]}"
                ;;
            --target-org|-o)
                org="${ARGS[$((i+1))]}"
                ;;
        esac
    done

    # If no manifest found, not a metadata deployment
    if [ -z "$manifest_path" ] && [ -z "$deploy_dir" ]; then
        exit 0
    fi

    # Detect if deployment contains picklist fields
    if ! detect_picklist_fields "$manifest_path" "$deploy_dir"; then
        # No picklist fields, no validation needed
        exit 0
    fi

    print_info "Picklist fields detected in deployment - running validation..."

    # Find all field metadata files in deployment
    local validation_errors=0
    local validation_warnings=0

    if [ -d "$deploy_dir" ]; then
        while IFS= read -r field_file; do
            # Get field API name from filename
            local field_name=$(basename "$field_file" .field-meta.xml)

            # Check if field is picklist type
            if ! grep -q -E "<type>(picklist|multipicklist)</type>" "$field_file"; then
                continue
            fi

            print_info "Validating picklist field: $field_name"

            # Check if field has dependency
            if check_controlling_field "$field_file"; then
                print_info "  → Dependency detected - validating structure..."

                # Validate dependency structure
                if ! validate_dependency_structure "$field_file"; then
                    print_error "  → Dependency structure validation failed for $field_name"
                    ((validation_errors++))
                else
                    print_success "  → Dependency structure valid for $field_name"
                fi

                # Check record type metadata
                if ! check_record_type_metadata "$manifest_path" "$deploy_dir" "$field_name"; then
                    ((validation_warnings++))
                fi
            else
                print_info "  → No dependency detected (standard picklist)"
            fi

        done < <(find "$deploy_dir" -name "*.field-meta.xml" -type f)
    fi

    # Report results
    echo ""
    echo "========================================="
    echo "  Picklist Dependency Validation Results"
    echo "========================================="

    if [ $validation_errors -gt 0 ]; then
        # Collect error details for stop prompt
        local error_details=()
        if [ -d "$deploy_dir" ]; then
            while IFS= read -r field_file; do
                local field_name=$(basename "$field_file" .field-meta.xml)
                if grep -q -E "<type>(picklist|multipicklist)</type>" "$field_file" && \
                   check_controlling_field "$field_file"; then
                    if ! validate_dependency_structure "$field_file" 2>/dev/null; then
                        error_details+=("Dependency structure invalid for $field_name")
                    fi
                fi
            done < <(find "$deploy_dir" -name "*.field-meta.xml" -type f 2>/dev/null)
        fi

        # Use guided stop prompt
        build_stop_prompt \
            --title "Picklist Dependency Validation Failed" \
            --severity error \
            --context "Found $validation_errors critical error(s) in picklist dependencies" \
            --step "Fix controllingField attributes on dependent picklists" \
            --step "Ensure valueSettings arrays are properly defined" \
            --step "Include RecordType metadata in deployment" \
            --step "Re-run deployment after fixes" \
            --tip "Use PicklistDependencyManager for automated dependency setup" \
            --code "node ${LIB_DIR}/picklist-dependency-manager.js --validate"
    elif [ $validation_warnings -gt 0 ]; then
        if [ "$PICKLIST_VALIDATION_STRICT" = "true" ]; then
            # Strict mode - stop with warning
            stop_with_warning \
                "Picklist validation warnings in strict mode" \
                "Found $validation_warnings warning(s) and PICKLIST_VALIDATION_STRICT=true" \
                "Fix the warnings listed above" \
                "OR disable strict mode: export PICKLIST_VALIDATION_STRICT=false" \
                "Then re-run deployment"
        else
            print_warning "Found $validation_warnings warning(s)"
            echo ""
            echo "Proceeding with deployment despite warnings..."
            echo ""
            exit 0
        fi
    else
        print_success "All picklist dependency validations passed"
        echo ""
        exit 0
    fi
}

# Main entry point
case "$COMMAND" in
    "sf project deploy start")
        validate_deployment
        ;;
    "sf data create")
        # Check if creating GlobalValueSet
        if echo "${ARGS[@]}" | grep -q "GlobalValueSet"; then
            print_info "GlobalValueSet creation detected"
            print_info "Ensure fields referencing this GVS are deployed after creation"
            exit 0
        fi
        exit 0
        ;;
    *)
        # Not a deployment command, skip validation
        exit 0
        ;;
esac
