#!/bin/bash
# operation-sequencer.sh - Intelligent operation sequencing for Salesforce
# Determines optimal order of operations based on dependencies and constraints

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Source dependencies
SCRIPT_DIR="$(dirname "$0")"
[ -f "${SCRIPT_DIR}/field-metadata-inspector.sh" ] && source "${SCRIPT_DIR}/field-metadata-inspector.sh"
[ -f "${SCRIPT_DIR}/sf-wrapper.sh" ] && source "${SCRIPT_DIR}/sf-wrapper.sh"

# Operation types and their priorities
declare -A OPERATION_PRIORITY=(
    ["CREATE_OBJECT"]=1
    ["CREATE_FIELD"]=2
    ["UPDATE_PICKLIST"]=3
    ["CREATE_RELATIONSHIP"]=4
    ["UPDATE_LAYOUT"]=5
    ["CREATE_VALIDATION"]=6
    ["UPDATE_PERMISSION"]=7
    ["INSERT_RECORD"]=8
    ["UPDATE_RECORD"]=9
    ["CREATE_FLOW"]=10
    ["ACTIVATE_FLOW"]=11
)

# Function to analyze field dependencies
analyze_field_dependencies() {
    local object="$1"
    local org="${2:-}"

    echo -e "${BLUE}Analyzing field dependencies for $object...${NC}"

    # Get all fields
    local fields=$(sf sobject describe \
        --sobject "$object" \
        ${org:+--targetusername "$org"} \
        --json 2>/dev/null | jq -r '.result.fields')

    # Find formula fields and their dependencies
    local formula_deps=()
    local lookup_refs=()
    local master_detail_refs=()

    echo "$fields" | jq -c '.[] | select(.calculated == true)' | while read -r field; do
        local name=$(echo "$field" | jq -r '.name')
        local formula=$(echo "$field" | jq -r '.calculatedFormula // ""')

        if [ -n "$formula" ] && [ "$formula" != "null" ]; then
            # Extract field references
            local deps=$(echo "$formula" | grep -oE '[A-Za-z_]+__c' | sort -u | tr '\n' ',' | sed 's/,$//')
            [ -n "$deps" ] && formula_deps+=("$name:$deps")
        fi
    done

    # Find lookup and master-detail relationships
    echo "$fields" | jq -c '.[] | select(.type == "reference")' | while read -r field; do
        local name=$(echo "$field" | jq -r '.name')
        local refs=$(echo "$field" | jq -r '.referenceTo[]' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        [ -n "$refs" ] && lookup_refs+=("$name:$refs")
    done

    # Output dependency graph
    cat <<EOF
{
    "object": "$object",
    "dependencies": {
        "formula_fields": $(printf '%s\n' "${formula_deps[@]}" | jq -R . | jq -s .),
        "lookup_relationships": $(printf '%s\n' "${lookup_refs[@]}" | jq -R . | jq -s .),
        "master_detail": $(printf '%s\n' "${master_detail_refs[@]}" | jq -R . | jq -s .)
    }
}
EOF
}

# Function to sequence operations based on dependencies
sequence_operations() {
    local operations_json="$1"
    local org="${2:-}"

    echo -e "${BLUE}=== Operation Sequencing Analysis ===${NC}"
    echo ""

    # Parse operations
    local operations=$(echo "$operations_json" | jq -c '.operations[]')

    # Build dependency graph
    local -A dependencies
    local -A operation_objects
    local -A operation_types
    local operation_count=0

    while IFS= read -r op; do
        local id=$(echo "$op" | jq -r '.id // "op_'$operation_count'"')
        local type=$(echo "$op" | jq -r '.type')
        local object=$(echo "$op" | jq -r '.object // ""')
        local depends_on=$(echo "$op" | jq -r '.depends_on[]?' 2>/dev/null | tr '\n' ',' | sed 's/,$//')

        operation_types[$id]="$type"
        operation_objects[$id]="$object"
        [ -n "$depends_on" ] && dependencies[$id]="$depends_on"

        ((operation_count++))
    done <<< "$operations"

    # Topological sort for execution order
    echo -e "${CYAN}Calculating optimal execution order...${NC}"
    echo ""

    local executed=()
    local pending=()
    local blocked=()

    # Identify operations with no dependencies
    for id in "${!operation_types[@]}"; do
        if [ -z "${dependencies[$id]}" ]; then
            pending+=("$id")
        else
            blocked+=("$id")
        fi
    done

    # Execute operations in order
    local sequence_num=1
    while [ ${#pending[@]} -gt 0 ] || [ ${#blocked[@]} -gt 0 ]; do
        if [ ${#pending[@]} -eq 0 ]; then
            # Check for circular dependencies
            if [ ${#blocked[@]} -gt 0 ]; then
                echo -e "${RED}✗ Circular dependency detected!${NC}"
                echo "Blocked operations: ${blocked[*]}"
                break
            fi
        fi

        # Sort pending by operation priority
        local sorted_pending=()
        for id in "${pending[@]}"; do
            local type="${operation_types[$id]}"
            local priority="${OPERATION_PRIORITY[$type]:-99}"
            sorted_pending+=("$priority:$id")
        done

        # Sort and execute
        IFS=$'\n' sorted_pending=($(sort -n <<<"${sorted_pending[*]}"))

        # Process first operation
        local next="${sorted_pending[0]}"
        local id="${next#*:}"

        echo -e "${GREEN}Step $sequence_num: ${operation_types[$id]}${NC}"
        echo "  Operation: $id"
        echo "  Type: ${operation_types[$id]}"
        [ -n "${operation_objects[$id]}" ] && echo "  Object: ${operation_objects[$id]}"
        [ -n "${dependencies[$id]}" ] && echo "  Dependencies: ${dependencies[$id]}"

        # Check for validation requirements
        case "${operation_types[$id]}" in
            "UPDATE_RECORD"|"INSERT_RECORD")
                echo -e "${YELLOW}  ⚠ Pre-check: Validate field updatability${NC}"
                ;;
            "CREATE_FIELD")
                echo -e "${YELLOW}  ⚠ Pre-check: Verify object exists${NC}"
                ;;
            "ACTIVATE_FLOW")
                echo -e "${YELLOW}  ⚠ Pre-check: Test flow in sandbox${NC}"
                ;;
            "UPDATE_PERMISSION")
                echo -e "${YELLOW}  ⚠ Pre-check: Backup current permissions${NC}"
                ;;
        esac

        echo ""

        # Mark as executed
        executed+=("$id")

        # Remove from pending
        pending=("${pending[@]/$id}")

        # Check if any blocked operations can now proceed
        local new_blocked=()
        for blocked_id in "${blocked[@]}"; do
            local deps="${dependencies[$blocked_id]}"
            local can_proceed=true

            # Check if all dependencies are met
            IFS=',' read -ra dep_array <<< "$deps"
            for dep in "${dep_array[@]}"; do
                if [[ ! " ${executed[@]} " =~ " ${dep} " ]]; then
                    can_proceed=false
                    break
                fi
            done

            if [ "$can_proceed" = true ]; then
                pending+=("$blocked_id")
            else
                new_blocked+=("$blocked_id")
            fi
        done
        blocked=("${new_blocked[@]}")

        ((sequence_num++))

        # Safety check
        if [ $sequence_num -gt 100 ]; then
            echo -e "${RED}Safety limit reached - possible infinite loop${NC}"
            break
        fi
    done

    # Summary
    echo -e "${BLUE}=== Execution Summary ===${NC}"
    echo "Total operations: $operation_count"
    echo "Executed: ${#executed[@]}"
    echo "Blocked: ${#blocked[@]}"

    if [ ${#blocked[@]} -gt 0 ]; then
        echo ""
        echo -e "${RED}Warning: Some operations could not be sequenced:${NC}"
        for id in "${blocked[@]}"; do
            echo "  - $id (${operation_types[$id]})"
        done
    fi
}

# Function to validate operation prerequisites
validate_prerequisites() {
    local operation="$1"
    local org="${2:-}"

    local type=$(echo "$operation" | jq -r '.type')
    local object=$(echo "$operation" | jq -r '.object // ""')
    local field=$(echo "$operation" | jq -r '.field // ""')

    echo -e "${BLUE}Validating prerequisites for $type...${NC}"

    case "$type" in
        "UPDATE_RECORD")
            # Check if fields are updateable
            if [ -n "$field" ]; then
                local updateable=$(is_field_updateable "$object" "$field" "$org")
                if [ "$updateable" != "true" ]; then
                    echo -e "${RED}✗ Field $field is not updateable${NC}"

                    # Check if it's a formula
                    local is_formula=$(is_formula_field "$object" "$field" "$org")
                    if [ "$is_formula" = "true" ]; then
                        echo -e "${YELLOW}  Suggestion: Update source fields instead${NC}"
                        local deps=$(get_formula_dependencies "$object" "$field" "$org")
                        echo "  Source fields: $deps"
                    fi
                    return 1
                fi
            fi
            echo -e "${GREEN}✓ Prerequisites met${NC}"
            ;;

        "CREATE_FIELD")
            # Check if object exists
            local obj_exists=$(sf sobject describe \
                --sobject "$object" \
                ${org:+--targetusername "$org"} \
                --json 2>/dev/null | jq -r '.result.name // ""')

            if [ -z "$obj_exists" ]; then
                echo -e "${RED}✗ Object $object does not exist${NC}"
                return 1
            fi
            echo -e "${GREEN}✓ Object exists${NC}"
            ;;

        "INSERT_RECORD")
            # Check required fields
            local required_fields=$(sf sobject describe \
                --sobject "$object" \
                ${org:+--targetusername "$org"} \
                --json 2>/dev/null | \
                jq -r '.result.fields[] | select(.nillable == false and .defaultedOnCreate == false) | .name')

            if [ -n "$required_fields" ]; then
                echo -e "${YELLOW}  Required fields for $object:${NC}"
                echo "$required_fields" | while read -r req; do
                    echo "    - $req"
                done
            fi
            echo -e "${GREEN}✓ Prerequisites checked${NC}"
            ;;

        *)
            echo -e "${GREEN}✓ No specific prerequisites${NC}"
            ;;
    esac
}

# Function to generate operation plan from requirements
generate_operation_plan() {
    local requirements="$1"
    local org="${2:-}"

    echo -e "${BLUE}=== Generating Operation Plan ===${NC}"
    echo ""

    # Parse requirements
    local req_type=$(echo "$requirements" | jq -r '.type // "unknown"')

    case "$req_type" in
        "field_update")
            # Generate plan for field updates
            local object=$(echo "$requirements" | jq -r '.object')
            local updates=$(echo "$requirements" | jq -r '.updates')

            echo "Requirement: Update fields on $object"
            echo ""

            # Check each field
            echo "$updates" | jq -c 'to_entries[]' | while read -r entry; do
                local field=$(echo "$entry" | jq -r '.key')
                local value=$(echo "$entry" | jq -r '.value')

                # Validate field
                local updateable=$(is_field_updateable "$object" "$field" "$org")

                if [ "$updateable" = "true" ]; then
                    echo -e "${GREEN}✓ Direct update: $field = $value${NC}"
                else
                    local is_formula=$(is_formula_field "$object" "$field" "$org")
                    if [ "$is_formula" = "true" ]; then
                        echo -e "${YELLOW}⚠ Formula field: $field${NC}"
                        echo "  Will resolve to source fields..."

                        # Get dependencies
                        local deps=$(get_formula_dependencies "$object" "$field" "$org")
                        echo "  Source fields needed: $deps"
                    else
                        echo -e "${RED}✗ Cannot update: $field (read-only)${NC}"
                    fi
                fi
            done
            ;;

        "data_migration")
            echo "Requirement: Data migration"
            echo ""
            echo "Suggested sequence:"
            echo "1. Export source data"
            echo "2. Validate target object fields"
            echo "3. Transform data format"
            echo "4. Create parent records"
            echo "5. Create child records"
            echo "6. Update relationships"
            echo "7. Validate data integrity"
            ;;

        *)
            echo "Unknown requirement type: $req_type"
            ;;
    esac
}

# Main execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    case "${1:-}" in
        analyze)
            shift
            analyze_field_dependencies "$@"
            ;;
        sequence)
            shift
            sequence_operations "$@"
            ;;
        validate)
            shift
            validate_prerequisites "$@"
            ;;
        plan)
            shift
            generate_operation_plan "$@"
            ;;
        *)
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  analyze <object> [org]              Analyze field dependencies"
            echo "  sequence <operations_json> [org]    Sequence operations"
            echo "  validate <operation_json> [org]     Validate prerequisites"
            echo "  plan <requirements_json> [org]      Generate operation plan"
            echo ""
            echo "Example operations JSON:"
            cat <<'EOF'
{
    "operations": [
        {
            "id": "op1",
            "type": "CREATE_FIELD",
            "object": "Account",
            "field": "CustomField__c"
        },
        {
            "id": "op2",
            "type": "UPDATE_RECORD",
            "object": "Account",
            "field": "CustomField__c",
            "depends_on": ["op1"]
        }
    ]
}
EOF
            exit 1
            ;;
    esac
fi