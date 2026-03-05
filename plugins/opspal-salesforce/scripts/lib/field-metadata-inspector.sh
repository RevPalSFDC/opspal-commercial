#!/bin/bash
# field-metadata-inspector.sh - Intelligent field metadata inspection and validation
# Prevents update failures by checking field properties before operations

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Source SF wrapper if available
LIB_DIR="$(dirname "$0")"
if [ -f "${LIB_DIR}/sf-wrapper.sh" ]; then
    source "${LIB_DIR}/sf-wrapper.sh"
else
    # Fallback wrapper
    sf_exec() { sf "$@" 2>&1 | grep -v "Warning.*update available"; }
fi

# Function to get field metadata
get_field_metadata() {
    local object="$1"
    local field="$2"
    local org="${3:-}"
    local org_flag=""

    if [ -n "$org" ]; then
        org_flag="--target-org $org"
    fi

    # Get field description using sf CLI
    local result=$(sf sobject describe \
        --sobject "$object" \
        $org_flag \
        --json 2>/dev/null | \
        jq -r ".result.fields[] | select(.name == \"$field\")")

    echo "$result"
}

# Function to check if field is updateable
is_field_updateable() {
    local object="$1"
    local field="$2"
    local org="${3:-}"

    local metadata=$(get_field_metadata "$object" "$field" "$org")

    if [ -z "$metadata" ]; then
        echo "false"
        return 1
    fi

    local updateable=$(echo "$metadata" | jq -r '.updateable // false')
    echo "$updateable"
}

# Function to get field type
get_field_type() {
    local object="$1"
    local field="$2"
    local org="${3:-}"

    local metadata=$(get_field_metadata "$object" "$field" "$org")
    echo "$metadata" | jq -r '.type // "unknown"'
}

# Function to check if field is a formula
is_formula_field() {
    local object="$1"
    local field="$2"
    local org="${3:-}"

    local metadata=$(get_field_metadata "$object" "$field" "$org")
    local calculated=$(echo "$metadata" | jq -r '.calculated // false')
    local formula=$(echo "$metadata" | jq -r '.calculatedFormula // ""')

    if [ "$calculated" = "true" ] || [ -n "$formula" ] && [ "$formula" != "null" ]; then
        echo "true"
    else
        echo "false"
    fi
}

# Function to get formula dependencies
get_formula_dependencies() {
    local object="$1"
    local field="$2"
    local org="${3:-}"

    local metadata=$(get_field_metadata "$object" "$field" "$org")
    local formula=$(echo "$metadata" | jq -r '.calculatedFormula // ""')

    if [ -n "$formula" ] && [ "$formula" != "null" ]; then
        # Extract field references from formula (basic pattern matching)
        echo "$formula" | grep -oE '[A-Za-z_]+__c' | sort -u
    fi
}

# Function to validate field update operation
validate_field_update() {
    local object="$1"
    local field="$2"
    local value="$3"
    local org="${4:-}"

    echo -e "${BLUE}=== Field Update Validation ===${NC}"
    echo "Object: $object"
    echo "Field: $field"
    echo "Value: $value"
    echo ""

    # Get field metadata
    local metadata=$(get_field_metadata "$object" "$field" "$org")

    if [ -z "$metadata" ]; then
        echo -e "${RED}✗ FAILED: Field not found${NC}"
        echo "  Field '$field' does not exist on object '$object'"
        return 1
    fi

    # Check if updateable
    local updateable=$(echo "$metadata" | jq -r '.updateable // false')
    if [ "$updateable" != "true" ]; then
        echo -e "${RED}✗ FAILED: Field not updateable${NC}"

        # Check if it's a formula field
        local calculated=$(echo "$metadata" | jq -r '.calculated // false')
        if [ "$calculated" = "true" ]; then
            echo -e "${YELLOW}  Reason: This is a formula field${NC}"

            # Get formula and suggest alternatives
            local formula=$(echo "$metadata" | jq -r '.calculatedFormula // ""')
            if [ -n "$formula" ] && [ "$formula" != "null" ]; then
                echo -e "${CYAN}  Formula: $formula${NC}"
                echo ""
                echo -e "${GREEN}  Suggested Solution:${NC}"
                echo "  Update the source fields instead:"

                # Extract field references
                local dependencies=$(echo "$formula" | grep -oE '[A-Za-z_]+__c' | sort -u)
                for dep in $dependencies; do
                    # Check if dependency is updateable
                    local dep_updateable=$(is_field_updateable "$object" "$dep" "$org")
                    if [ "$dep_updateable" = "true" ]; then
                        echo -e "    ${GREEN}✓${NC} $dep (updateable)"
                    else
                        echo -e "    ${RED}✗${NC} $dep (not updateable)"
                    fi
                done
            fi
        else
            # Check other reasons for non-updateable
            local autoNumber=$(echo "$metadata" | jq -r '.autoNumber // false')
            local defaultedOnCreate=$(echo "$metadata" | jq -r '.defaultedOnCreate // false')
            local externalId=$(echo "$metadata" | jq -r '.externalId // false')

            if [ "$autoNumber" = "true" ]; then
                echo "  Reason: Auto-number field"
            elif [ "$defaultedOnCreate" = "true" ]; then
                echo "  Reason: System field with default value on create"
            elif [ "$externalId" = "true" ]; then
                echo "  Reason: External ID field"
            else
                echo "  Reason: System or read-only field"
            fi
        fi
        return 1
    fi

    # Check field type compatibility
    local fieldType=$(echo "$metadata" | jq -r '.type // "unknown"')
    echo -e "${GREEN}✓ Field is updateable${NC}"
    echo "  Type: $fieldType"

    # Validate value based on type
    case "$fieldType" in
        "currency"|"double"|"percent"|"int")
            if ! [[ "$value" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                echo -e "${YELLOW}⚠ Warning: Value may not be valid for numeric field${NC}"
                echo "  Expected: Numeric value"
                echo "  Provided: $value"
            fi
            ;;
        "boolean")
            if ! [[ "$value" =~ ^(true|false|TRUE|FALSE|0|1)$ ]]; then
                echo -e "${YELLOW}⚠ Warning: Value may not be valid for boolean field${NC}"
                echo "  Expected: true/false"
                echo "  Provided: $value"
            fi
            ;;
        "date")
            if ! [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                echo -e "${YELLOW}⚠ Warning: Value may not be valid for date field${NC}"
                echo "  Expected: YYYY-MM-DD format"
                echo "  Provided: $value"
            fi
            ;;
        "datetime")
            if ! [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2} ]]; then
                echo -e "${YELLOW}⚠ Warning: Value may not be valid for datetime field${NC}"
                echo "  Expected: YYYY-MM-DDTHH:MM:SS format"
                echo "  Provided: $value"
            fi
            ;;
        "picklist")
            # Get picklist values
            local picklistValues=$(echo "$metadata" | jq -r '.picklistValues[]?.value // empty' | tr '\n' ', ')
            echo "  Valid values: $picklistValues"
            ;;
    esac

    # Check field constraints
    local required=$(echo "$metadata" | jq -r '.nillable // true')
    if [ "$required" = "false" ] && [ -z "$value" ]; then
        echo -e "${RED}✗ Value cannot be null - field is required${NC}"
        return 1
    fi

    local length=$(echo "$metadata" | jq -r '.length // 0')
    if [ "$length" -gt 0 ] && [ "${#value}" -gt "$length" ]; then
        echo -e "${YELLOW}⚠ Warning: Value exceeds maximum length ($length)${NC}"
    fi

    echo -e "${GREEN}✓ Validation passed${NC}"
    return 0
}

# Function to analyze object for update operations
analyze_object_for_updates() {
    local object="$1"
    local org="${2:-}"
    local fields="${3:-}"  # Comma-separated list of fields to check

    echo -e "${BLUE}=== Object Update Analysis: $object ===${NC}"
    echo ""

    # Get all fields if not specified
    if [ -z "$fields" ]; then
        fields=$(sf sobject describe \
            --sobject "$object" \
            ${org:+--targetusername "$org"} \
            --json 2>/dev/null | \
            jq -r '.result.fields[].name' | tr '\n' ',')
    fi

    # Convert comma-separated to array
    IFS=',' read -ra FIELDS <<< "$fields"

    # Categories
    local updateable_fields=()
    local formula_fields=()
    local readonly_fields=()
    local system_fields=()

    # Analyze each field
    for field in "${FIELDS[@]}"; do
        [ -z "$field" ] && continue

        local metadata=$(get_field_metadata "$object" "$field" "$org")
        [ -z "$metadata" ] && continue

        local updateable=$(echo "$metadata" | jq -r '.updateable // false')
        local calculated=$(echo "$metadata" | jq -r '.calculated // false')
        local custom=$(echo "$metadata" | jq -r '.custom // false')

        if [ "$updateable" = "true" ]; then
            updateable_fields+=("$field")
        elif [ "$calculated" = "true" ]; then
            formula_fields+=("$field")
        elif [ "$custom" = "true" ]; then
            readonly_fields+=("$field")
        else
            system_fields+=("$field")
        fi
    done

    # Display results
    echo -e "${GREEN}Updateable Fields (${#updateable_fields[@]}):${NC}"
    for field in "${updateable_fields[@]}"; do
        local type=$(get_field_type "$object" "$field" "$org")
        echo "  ✓ $field ($type)"
    done

    if [ ${#formula_fields[@]} -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}Formula Fields (${#formula_fields[@]}) - Cannot be directly updated:${NC}"
        for field in "${formula_fields[@]}"; do
            echo "  ⚠ $field"

            # Show dependencies
            local deps=$(get_formula_dependencies "$object" "$field" "$org")
            if [ -n "$deps" ]; then
                echo "    Dependencies: $deps"
            fi
        done
    fi

    if [ ${#readonly_fields[@]} -gt 0 ]; then
        echo ""
        echo -e "${RED}Read-only Custom Fields (${#readonly_fields[@]}):${NC}"
        for field in "${readonly_fields[@]}"; do
            echo "  ✗ $field"
        done
    fi

    if [ ${#system_fields[@]} -gt 0 ]; then
        echo ""
        echo -e "${CYAN}System Fields (${#system_fields[@]}):${NC}"
        echo "  (Hidden for brevity - use --verbose to see all)"
    fi

    echo ""
    echo -e "${BLUE}Summary:${NC}"
    echo "  Total fields analyzed: $((${#updateable_fields[@]} + ${#formula_fields[@]} + ${#readonly_fields[@]} + ${#system_fields[@]}))"
    echo "  Updateable: ${#updateable_fields[@]}"
    echo "  Formula: ${#formula_fields[@]}"
    echo "  Read-only: ${#readonly_fields[@]}"
    echo "  System: ${#system_fields[@]}"
}

# Main execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    case "${1:-}" in
        check)
            shift
            is_field_updateable "$@"
            ;;
        type)
            shift
            get_field_type "$@"
            ;;
        formula)
            shift
            is_formula_field "$@"
            ;;
        deps|dependencies)
            shift
            get_formula_dependencies "$@"
            ;;
        validate)
            shift
            validate_field_update "$@"
            ;;
        analyze)
            shift
            analyze_object_for_updates "$@"
            ;;
        *)
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  check <object> <field> [org]         Check if field is updateable"
            echo "  type <object> <field> [org]          Get field type"
            echo "  formula <object> <field> [org]       Check if field is formula"
            echo "  deps <object> <field> [org]          Get formula dependencies"
            echo "  validate <object> <field> <value> [org]  Validate update operation"
            echo "  analyze <object> [org] [fields]      Analyze object for updates"
            echo ""
            echo "Examples:"
            echo "  $0 check Account Name"
            echo "  $0 validate Subscription__c ARR__c 50000 myorg"
            echo "  $0 analyze Subscription__c myorg 'ARR__c,MRR__c,Product__c'"
            echo "  $0 deps Subscription__c ARR__c"
            exit 1
            ;;
    esac
fi
