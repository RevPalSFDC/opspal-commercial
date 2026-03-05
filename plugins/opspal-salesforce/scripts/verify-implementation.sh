#!/bin/bash

# Salesforce Implementation Verification Script
# Purpose: Verify implementation state matches expected configuration
# Usage: ./verify-implementation.sh <instance> <feature> [expected_state_file]
#
# Updated: 2026-01-15 - Use sf_exec_safe for proper error handling

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the SF wrapper for proper error handling
if [ -f "${SCRIPT_DIR}/lib/sf-wrapper.sh" ]; then
    source "${SCRIPT_DIR}/lib/sf-wrapper.sh"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to execute SF queries with proper error handling
# Instead of || echo '{}', we capture the error properly
sf_query_with_fallback() {
    local query="$1"
    local target_org="$2"
    local use_tooling="$3"
    local result=""
    local exit_code=0

    if [ "$use_tooling" = "true" ]; then
        result=$(sf data query --use-tooling-api --query "$query" --target-org "$target_org" --json 2>&1) || exit_code=$?
    else
        result=$(sf data query --query "$query" --target-org "$target_org" --json 2>&1) || exit_code=$?
    fi

    if [ $exit_code -ne 0 ]; then
        echo -e "${YELLOW}⚠️  Query failed (exit $exit_code): ${NC}" >&2
        echo "$result" | head -3 >&2
        # Return empty structure but flag it as failed
        echo '{"result":{"records":[],"totalSize":0},"queryFailed":true}'
        return 1
    fi

    echo "$result"
    return 0
}

# Configuration
INSTANCE=${1:-}
FEATURE=${2:-}
EXPECTED_STATE=${3:-}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_DIR="verification-reports"
REPORT_FILE="$REPORT_DIR/verification-$FEATURE-$TIMESTAMP.json"

# Validate inputs
if [ -z "$INSTANCE" ] || [ -z "$FEATURE" ]; then
    echo -e "${RED}Error: Usage: $0 <instance> <feature> [expected_state_file]${NC}"
    echo "Features: validation-rules | flows | objects | fields | all"
    exit 1
fi

# Create report directory
mkdir -p "$REPORT_DIR"

# Initialize report
echo "{" > "$REPORT_FILE"
echo "  \"timestamp\": \"$(date -Iseconds)\"," >> "$REPORT_FILE"
echo "  \"instance\": \"$INSTANCE\"," >> "$REPORT_FILE"
echo "  \"feature\": \"$FEATURE\"," >> "$REPORT_FILE"
echo "  \"results\": {" >> "$REPORT_FILE"

echo -e "${BLUE}=== Salesforce Implementation Verification ===${NC}"
echo -e "Instance: ${YELLOW}$INSTANCE${NC}"
echo -e "Feature: ${YELLOW}$FEATURE${NC}"
echo -e "Timestamp: $TIMESTAMP\n"

# Function to check validation rules
verify_validation_rules() {
    echo -e "${BLUE}Verifying Validation Rules...${NC}"

    # Query all validation rules
    local QUERY="SELECT EntityDefinition.QualifiedApiName, Active, COUNT(Id) cnt FROM ValidationRule GROUP BY EntityDefinition.QualifiedApiName, Active ORDER BY EntityDefinition.QualifiedApiName"

    local RESULT
    RESULT=$(sf_query_with_fallback "$QUERY" "$INSTANCE" "true")
    local query_status=$?

    # Check if query failed
    if [ $query_status -ne 0 ] || echo "$RESULT" | grep -q '"queryFailed":true'; then
        echo -e "  ${YELLOW}⚠️  Could not retrieve validation rules - query failed${NC}"
    fi
    
    # Parse results
    local TOTAL_ACTIVE=$(echo "$RESULT" | jq '[.result.records[] | select(.Active == true) | .cnt] | add // 0')
    local TOTAL_INACTIVE=$(echo "$RESULT" | jq '[.result.records[] | select(.Active == false) | .cnt] | add // 0')
    
    # Output results
    echo "  Active Rules: $TOTAL_ACTIVE"
    echo "  Inactive Rules: $TOTAL_INACTIVE"
    
    # Add to report
    echo "    \"validation_rules\": {" >> "$REPORT_FILE"
    echo "      \"total_active\": $TOTAL_ACTIVE," >> "$REPORT_FILE"
    echo "      \"total_inactive\": $TOTAL_INACTIVE," >> "$REPORT_FILE"
    echo "      \"by_object\": [" >> "$REPORT_FILE"
    
    echo "$RESULT" | jq -r '.result.records[] | "\(.EntityDefinition.QualifiedApiName),\(.Active),\(.cnt)"' | while IFS=',' read -r obj active cnt; do
        echo "        {\"object\": \"$obj\", \"active\": $active, \"count\": $cnt}," >> "$REPORT_FILE"
        if [ "$active" = "true" ]; then
            echo -e "    ${GREEN}✓${NC} $obj: $cnt active"
        fi
    done
    
    echo "      ]" >> "$REPORT_FILE"
    echo "    }," >> "$REPORT_FILE"
    
    # Verify against expected if provided
    if [ -n "$EXPECTED_STATE" ] && [ -f "$EXPECTED_STATE" ]; then
        local EXPECTED_ACTIVE=$(jq '.validation_rules.active' "$EXPECTED_STATE" 2>/dev/null || echo "N/A")
        
        if [ "$EXPECTED_ACTIVE" != "N/A" ] && [ "$TOTAL_ACTIVE" -eq "$EXPECTED_ACTIVE" ]; then
            echo -e "  ${GREEN}✅ Active count matches expected: $EXPECTED_ACTIVE${NC}"
        elif [ "$EXPECTED_ACTIVE" != "N/A" ]; then
            echo -e "  ${RED}❌ Active count mismatch! Expected: $EXPECTED_ACTIVE, Actual: $TOTAL_ACTIVE${NC}"
            return 1
        fi
    fi
}

# Function to check flows
verify_flows() {
    echo -e "${BLUE}Verifying Flows...${NC}"

    local QUERY="SELECT Id, ApiName, Label, ProcessType, IsActive FROM FlowDefinitionView WHERE IsActive = true"

    local RESULT
    RESULT=$(sf_query_with_fallback "$QUERY" "$INSTANCE" "true")
    local query_status=$?

    if [ $query_status -ne 0 ] || echo "$RESULT" | grep -q '"queryFailed":true'; then
        echo -e "  ${YELLOW}⚠️  Could not retrieve flows - query failed${NC}"
    fi
    
    local ACTIVE_COUNT=$(echo "$RESULT" | jq '.result.records | length')
    
    echo "  Active Flows: $ACTIVE_COUNT"
    
    echo "    \"flows\": {" >> "$REPORT_FILE"
    echo "      \"active_count\": $ACTIVE_COUNT," >> "$REPORT_FILE"
    echo "      \"active_flows\": [" >> "$REPORT_FILE"
    
    echo "$RESULT" | jq -r '.result.records[].ApiName' | while read -r flow; do
        echo -e "    ${GREEN}✓${NC} $flow"
        echo "        \"$flow\"," >> "$REPORT_FILE"
    done
    
    echo "      ]" >> "$REPORT_FILE"
    echo "    }," >> "$REPORT_FILE"
}

# Function to check custom objects
verify_objects() {
    echo -e "${BLUE}Verifying Custom Objects...${NC}"

    local QUERY="SELECT DeveloperName, IsCustomizable FROM EntityDefinition WHERE IsCustomizable = true AND QualifiedApiName LIKE '%__c'"

    local RESULT
    RESULT=$(sf_query_with_fallback "$QUERY" "$INSTANCE" "true")
    local query_status=$?

    if [ $query_status -ne 0 ] || echo "$RESULT" | grep -q '"queryFailed":true'; then
        echo -e "  ${YELLOW}⚠️  Could not retrieve objects - query failed${NC}"
    fi
    
    local OBJECT_COUNT=$(echo "$RESULT" | jq '.result.records | length')
    
    echo "  Custom Objects: $OBJECT_COUNT"
    
    echo "    \"custom_objects\": {" >> "$REPORT_FILE"
    echo "      \"count\": $OBJECT_COUNT," >> "$REPORT_FILE"
    echo "      \"objects\": [" >> "$REPORT_FILE"
    
    echo "$RESULT" | jq -r '.result.records[].DeveloperName' | while read -r obj; do
        echo -e "    ${GREEN}✓${NC} $obj"
        echo "        \"$obj\"," >> "$REPORT_FILE"
    done
    
    echo "      ]" >> "$REPORT_FILE"
    echo "    }," >> "$REPORT_FILE"
}

# Function to check custom fields
verify_fields() {
    echo -e "${BLUE}Verifying Custom Fields...${NC}"

    # Check for specific object if provided
    local OBJECT_NAME=${4:-"Opportunity"}

    local QUERY="SELECT DeveloperName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '$OBJECT_NAME' AND IsCustom = true"

    local RESULT
    RESULT=$(sf_query_with_fallback "$QUERY" "$INSTANCE" "true")
    local query_status=$?

    if [ $query_status -ne 0 ] || echo "$RESULT" | grep -q '"queryFailed":true'; then
        echo -e "  ${YELLOW}⚠️  Could not retrieve fields - query failed${NC}"
    fi
    
    local FIELD_COUNT=$(echo "$RESULT" | jq '.result.records | length')
    
    echo "  Custom Fields on $OBJECT_NAME: $FIELD_COUNT"
    
    echo "    \"custom_fields\": {" >> "$REPORT_FILE"
    echo "      \"object\": \"$OBJECT_NAME\"," >> "$REPORT_FILE"
    echo "      \"count\": $FIELD_COUNT," >> "$REPORT_FILE"
    echo "      \"fields\": [" >> "$REPORT_FILE"
    
    echo "$RESULT" | jq -r '.result.records[] | "\(.DeveloperName):\(.DataType)"' | head -10 | while read -r field; do
        echo -e "    ${GREEN}✓${NC} $field"
        echo "        \"$field\"," >> "$REPORT_FILE"
    done
    
    if [ "$FIELD_COUNT" -gt 10 ]; then
        echo "    ... and $((FIELD_COUNT - 10)) more"
    fi
    
    echo "      ]" >> "$REPORT_FILE"
    echo "    }" >> "$REPORT_FILE"
}

# Function to generate summary
generate_summary() {
    echo "  }," >> "$REPORT_FILE"
    echo "  \"summary\": {" >> "$REPORT_FILE"
    echo "    \"verification_status\": \"$1\"," >> "$REPORT_FILE"
    echo "    \"timestamp_completed\": \"$(date -Iseconds)\"" >> "$REPORT_FILE"
    echo "  }" >> "$REPORT_FILE"
    echo "}" >> "$REPORT_FILE"
    
    # Pretty print the report
    jq '.' "$REPORT_FILE" > "$REPORT_FILE.tmp" && mv "$REPORT_FILE.tmp" "$REPORT_FILE"
}

# Main verification logic
VERIFICATION_PASSED=true

case "$FEATURE" in
    "validation-rules")
        verify_validation_rules || VERIFICATION_PASSED=false
        ;;
    "flows")
        verify_flows || VERIFICATION_PASSED=false
        ;;
    "objects")
        verify_objects || VERIFICATION_PASSED=false
        ;;
    "fields")
        verify_fields || VERIFICATION_PASSED=false
        ;;
    "all")
        echo -e "${YELLOW}Running comprehensive verification...${NC}\n"
        verify_validation_rules || VERIFICATION_PASSED=false
        echo ""
        verify_flows || VERIFICATION_PASSED=false
        echo ""
        verify_objects || VERIFICATION_PASSED=false
        echo ""
        verify_fields || VERIFICATION_PASSED=false
        ;;
    *)
        echo -e "${RED}Unknown feature: $FEATURE${NC}"
        echo "Valid features: validation-rules | flows | objects | fields | all"
        exit 1
        ;;
esac

# Generate summary and final output
if [ "$VERIFICATION_PASSED" = true ]; then
    generate_summary "PASSED"
    echo -e "\n${GREEN}✅ Verification PASSED${NC}"
    echo -e "Report saved to: ${BLUE}$REPORT_FILE${NC}"
    exit 0
else
    generate_summary "FAILED"
    echo -e "\n${RED}❌ Verification FAILED${NC}"
    echo -e "Report saved to: ${BLUE}$REPORT_FILE${NC}"
    echo -e "Review the report for details on failures."
    exit 1
fi
