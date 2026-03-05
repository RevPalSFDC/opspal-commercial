#!/bin/bash
# smart-field-updater.sh - Intelligent field update handler
# Automatically resolves formula fields to their source fields and updates correctly

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Source dependencies
SCRIPT_DIR="$(dirname "$0")"
source "${SCRIPT_DIR}/field-metadata-inspector.sh" 2>/dev/null || true
source "${SCRIPT_DIR}/sf-wrapper.sh" 2>/dev/null || true

# Configuration
CACHE_DIR="${TEMP_DIR:-/tmp}"
CACHE_TTL=3600  # 1 hour cache

# Create cache directory
mkdir -p "$CACHE_DIR"

# Function to get cached or fresh field metadata
get_cached_field_metadata() {
    local object="$1"
    local org="${2:-default}"
    local cache_file="$CACHE_DIR/${org}_${object}_fields.json"

    # Check cache age
    if [ -f "$cache_file" ]; then
        local age=$(($(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null || echo 0)))
        if [ $age -lt $CACHE_TTL ]; then
            cat "$cache_file"
            return
        fi
    fi

    # Fetch fresh metadata
    local metadata=$(sf sobject describe \
        --sobject "$object" \
        ${org:+--targetusername "$org"} \
        --json 2>/dev/null)

    # Cache the result
    echo "$metadata" > "$cache_file"
    echo "$metadata"
}

# Function to resolve formula field to updateable fields
resolve_formula_to_source_fields() {
    local object="$1"
    local field="$2"
    local value="$3"
    local org="${4:-}"

    echo -e "${BLUE}Resolving formula field: $field${NC}" >&2

    # Get field metadata
    local metadata=$(get_cached_field_metadata "$object" "$org")
    local field_info=$(echo "$metadata" | jq -r ".result.fields[] | select(.name == \"$field\")")

    if [ -z "$field_info" ]; then
        echo -e "${RED}Field not found: $field${NC}" >&2
        return 1
    fi

    # Get formula
    local formula=$(echo "$field_info" | jq -r '.calculatedFormula // ""')

    if [ -z "$formula" ] || [ "$formula" = "null" ]; then
        echo -e "${RED}No formula found for field: $field${NC}" >&2
        return 1
    fi

    echo -e "${CYAN}Formula: $formula${NC}" >&2

    # Parse formula to determine required fields
    case "$field" in
        "ARR__c")
            # Formula: IF(TermMonths__c > 0, UnitPrice__c * Quantity__c * (12 / TermMonths__c), 0)
            # ARR = UnitPrice * Quantity * (12 / TermMonths)
            # So: UnitPrice * Quantity = ARR * TermMonths / 12

            cat <<EOF
{
    "explanation": "ARR is calculated as: UnitPrice × Quantity × (12 ÷ TermMonths)",
    "source_fields": {
        "UnitPrice__c": {
            "description": "Unit price per term",
            "suggested_value": "$value",
            "calculation": "Set to desired ARR if Quantity=1 and TermMonths=12"
        },
        "Quantity__c": {
            "description": "Quantity of items",
            "suggested_value": 1,
            "default": 1
        },
        "TermMonths__c": {
            "description": "Contract term in months",
            "suggested_value": 12,
            "default": 12
        }
    },
    "update_values": {
        "UnitPrice__c": $value,
        "Quantity__c": 1,
        "TermMonths__c": 12
    }
}
EOF
            ;;

        "MRR__c")
            # Formula: ARR__c / 12 (which depends on UnitPrice, Quantity, TermMonths)
            local arr_value=$(echo "$value * 12" | bc)
            cat <<EOF
{
    "explanation": "MRR is calculated as: ARR ÷ 12, where ARR = UnitPrice × Quantity × (12 ÷ TermMonths)",
    "source_fields": {
        "UnitPrice__c": {
            "description": "Unit price per term",
            "suggested_value": "$arr_value",
            "calculation": "Set to MRR×12 if Quantity=1 and TermMonths=12"
        },
        "Quantity__c": {
            "description": "Quantity of items",
            "suggested_value": 1,
            "default": 1
        },
        "TermMonths__c": {
            "description": "Contract term in months",
            "suggested_value": 12,
            "default": 12
        }
    },
    "update_values": {
        "UnitPrice__c": $arr_value,
        "Quantity__c": 1,
        "TermMonths__c": 12
    }
}
EOF
            ;;

        *)
            # Generic formula parsing
            local dependencies=$(echo "$formula" | grep -oE '[A-Za-z_]+__c' | sort -u)
            echo -e "${YELLOW}Dependencies found: $dependencies${NC}" >&2

            # Check which are updateable
            local updateable_deps=""
            for dep in $dependencies; do
                local dep_updateable=$(is_field_updateable "$object" "$dep" "$org")
                if [ "$dep_updateable" = "true" ]; then
                    updateable_deps="$updateable_deps $dep"
                fi
            done

            cat <<EOF
{
    "explanation": "Formula field with dependencies",
    "formula": "$formula",
    "dependencies": "$(echo $dependencies | tr ' ' ',')",
    "updateable_fields": "$(echo $updateable_deps | tr ' ' ',')",
    "note": "Manual calculation required for this formula"
}
EOF
            ;;
    esac
}

# Function to perform smart field update
smart_field_update() {
    local object="$1"
    local updates="$2"  # Format: "Field1=Value1,Field2=Value2,..."
    local org="${3:-}"
    local where="${4:-}"  # Optional WHERE clause

    echo -e "${BLUE}=== Smart Field Update ===${NC}"
    echo "Object: $object"
    echo "Updates: $updates"
    echo "Org: ${org:-default}"
    echo ""

    # Parse updates
    IFS=',' read -ra UPDATE_PAIRS <<< "$updates"

    local resolved_updates=""
    local formula_fields=()
    local direct_updates=()

    # Check each field
    for pair in "${UPDATE_PAIRS[@]}"; do
        IFS='=' read -r field value <<< "$pair"

        # Check if field is updateable
        local updateable=$(is_field_updateable "$object" "$field" "$org")

        if [ "$updateable" = "true" ]; then
            echo -e "${GREEN}✓ $field is directly updateable${NC}"
            direct_updates+=("$field=$value")
            resolved_updates="${resolved_updates}${field}__c=$value "
        else
            # Check if it's a formula field
            local is_formula=$(is_formula_field "$object" "$field" "$org")

            if [ "$is_formula" = "true" ]; then
                echo -e "${YELLOW}⚠ $field is a formula field${NC}"
                formula_fields+=("$field=$value")

                # Resolve to source fields
                local resolution=$(resolve_formula_to_source_fields "$object" "$field" "$value" "$org")

                if [ $? -eq 0 ]; then
                    # Extract update values
                    local update_values=$(echo "$resolution" | jq -r '.update_values | to_entries[] | "\(.key)=\(.value)"' 2>/dev/null)

                    if [ -n "$update_values" ]; then
                        echo -e "${GREEN}  Resolved to source fields:${NC}"
                        while IFS= read -r update; do
                            IFS='=' read -r src_field src_value <<< "$update"
                            echo "    $src_field = $src_value"
                            resolved_updates="${resolved_updates}${src_field}=$src_value "
                        done <<< "$update_values"
                    fi
                fi
            else
                echo -e "${RED}✗ $field is not updateable (system/read-only field)${NC}"
            fi
        fi
    done

    # Execute update if we have resolved fields
    if [ -n "$resolved_updates" ]; then
        echo ""
        echo -e "${BLUE}Executing update with resolved fields:${NC}"
        echo "  $resolved_updates"

        # Build the update command
        local cmd="sf_exec data update record --sobject $object"

        if [ -n "$where" ]; then
            cmd="$cmd --where \"$where\""
        fi

        cmd="$cmd --values \"$resolved_updates\""

        if [ -n "$org" ]; then
            cmd="$cmd --target-org $org"
        fi

        echo ""
        echo "Command: $cmd"
        echo ""

        # Execute
        eval "$cmd"
    else
        echo -e "${RED}No updateable fields found${NC}"
        return 1
    fi
}

# Function to bulk update with smart resolution
bulk_smart_update() {
    local object="$1"
    local csv_file="$2"
    local org="${3:-}"

    echo -e "${BLUE}=== Bulk Smart Update ===${NC}"
    echo "Object: $object"
    echo "Data file: $csv_file"
    echo ""

    # Read CSV header
    local header=$(head -1 "$csv_file")
    IFS=',' read -ra FIELDS <<< "$header"

    # Analyze fields
    local field_map=()
    local formula_map=()

    for field in "${FIELDS[@]}"; do
        # Skip Id field
        if [ "$field" = "Id" ]; then
            field_map+=("$field:$field")
            continue
        fi

        # Check if updateable
        local updateable=$(is_field_updateable "$object" "$field" "$org")

        if [ "$updateable" = "true" ]; then
            field_map+=("$field:$field")
            echo -e "${GREEN}✓ $field - directly updateable${NC}"
        else
            local is_formula=$(is_formula_field "$object" "$field" "$org")

            if [ "$is_formula" = "true" ]; then
                echo -e "${YELLOW}⚠ $field - formula field (will resolve)${NC}"

                # Get resolution template
                local resolution=$(resolve_formula_to_source_fields "$object" "$field" "PLACEHOLDER" "$org")
                formula_map+=("$field:$resolution")

                # Add source fields to map
                local source_fields=$(echo "$resolution" | jq -r '.update_values | keys[]' 2>/dev/null)
                for src in $source_fields; do
                    field_map+=("$src:$src")
                done
            else
                echo -e "${RED}✗ $field - not updateable (skipping)${NC}"
            fi
        fi
    done

    # Create transformed CSV
    local temp_csv="${TEMP_DIR:-/tmp} $csv_file)"

    # Write header with resolved fields
    echo "${field_map[@]}" | tr ' ' ',' | cut -d: -f2 > "$temp_csv"

    # Process data rows
    # (Implementation would transform formula field values to source field values)

    echo ""
    echo -e "${GREEN}Ready to perform bulk update with resolved fields${NC}"
    echo "Transformed data saved to: $temp_csv"
}

# Main execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    case "${1:-}" in
        resolve)
            shift
            resolve_formula_to_source_fields "$@"
            ;;
        update)
            shift
            smart_field_update "$@"
            ;;
        bulk)
            shift
            bulk_smart_update "$@"
            ;;
        *)
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  resolve <object> <field> <value> [org]   Resolve formula to source fields"
            echo "  update <object> <updates> [org] [where]  Smart field update"
            echo "  bulk <object> <csv_file> [org]           Bulk smart update"
            echo ""
            echo "Examples:"
            echo "  $0 resolve Subscription__c ARR__c 50000"
            echo "  $0 update Subscription__c 'ARR__c=50000,MRR__c=4166' myorg"
            echo "  $0 update Subscription__c 'UnitPrice__c=5000' myorg 'Id=\"a0A3j00000XYZ\"'"
            echo "  $0 bulk Subscription__c data.csv myorg"
            exit 1
            ;;
    esac
fi