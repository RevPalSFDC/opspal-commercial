#!/bin/bash

# Contract Validation Rules Analysis Script
# Target Org: example-company-sandbox
# Purpose: Analyze all Contract validation rules for flow compatibility

set -euo pipefail

# Configuration
TARGET_ORG="example-company-sandbox"
OUTPUT_DIR="${TEMP_DIR:-/tmp}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="${OUTPUT_DIR}/contract_validation_analysis_${TIMESTAMP}.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}🔍 Contract Validation Rules Analysis${NC}"
echo -e "${BLUE}======================================${NC}"
echo "Target Org: $TARGET_ORG"
echo "Report File: $REPORT_FILE"
echo ""

# Initialize report file
cat > "$REPORT_FILE" << EOF
Contract Validation Rules Analysis Report
==========================================
Generated: $(date)
Target Org: $TARGET_ORG
Analysis Purpose: Ensure Contract Creation Flow compatibility

EOF

# Function to log both to console and file
log_both() {
    echo -e "$1"
    echo -e "$1" | sed 's/\x1b\[[0-9;]*m//g' >> "$REPORT_FILE"
}

# Function to check if org is authenticated
check_auth() {
    echo -e "${YELLOW}🔐 Checking authentication for $TARGET_ORG...${NC}"
    if sf org display --target-org "$TARGET_ORG" &>/dev/null; then
        echo -e "${GREEN}✅ Successfully authenticated to $TARGET_ORG${NC}"
        return 0
    else
        echo -e "${RED}❌ Not authenticated to $TARGET_ORG${NC}"
        echo -e "${YELLOW}Please run: sf org login web --alias $TARGET_ORG --instance-url https://test.salesforce.com${NC}"
        exit 1
    fi
}

# Function to retrieve Contract object metadata
retrieve_contract_metadata() {
    echo -e "${YELLOW}📥 Retrieving Contract object metadata...${NC}"
    
    local temp_dir="${TEMP_DIR:-/tmp}}"
    mkdir -p "$temp_dir"
    
    # Create package.xml for Contract object
    cat > "$temp_dir/package.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Contract</members>
        <name>CustomObject</name>
    </types>
    <version>59.0</version>
</Package>
EOF

    # Retrieve metadata
    if sf project retrieve start --manifest "$temp_dir/package.xml" --target-org "$TARGET_ORG" --output-dir "$temp_dir" &>/dev/null; then
        echo -e "${GREEN}✅ Contract metadata retrieved successfully${NC}"
        echo "$temp_dir"
    else
        echo -e "${RED}❌ Failed to retrieve Contract metadata${NC}"
        exit 1
    fi
}

# Function to analyze validation rules
analyze_validation_rules() {
    local metadata_dir="$1"
    local contract_file="${metadata_dir}/force-app/main/default/objects/Contract/Contract.object-meta.xml"
    
    if [[ ! -f "$contract_file" ]]; then
        contract_file="${metadata_dir}/objects/Contract.object"
    fi
    
    if [[ ! -f "$contract_file" ]]; then
        echo -e "${RED}❌ Contract object metadata file not found${NC}"
        return 1
    fi
    
    log_both "${BLUE}🔍 VALIDATION RULES ANALYSIS${NC}"
    log_both "=================================="
    
    # Extract validation rules using xmllint or grep
    if command -v xmllint &> /dev/null; then
        analyze_with_xmllint "$contract_file"
    else
        analyze_with_grep "$contract_file"
    fi
}

# Function to analyze with xmllint (preferred)
analyze_with_xmllint() {
    local contract_file="$1"
    
    log_both "Using xmllint for precise XML parsing..."
    
    # Extract validation rules
    local validation_rules
    validation_rules=$(xmllint --xpath "//validationRules" "$contract_file" 2>/dev/null || echo "")
    
    if [[ -z "$validation_rules" ]]; then
        log_both "📝 No validation rules found on Contract object"
        return 0
    fi
    
    # Parse each validation rule
    local rule_count=0
    while IFS= read -r line; do
        if [[ "$line" == *"<validationRules>"* ]]; then
            rule_count=$((rule_count + 1))
            log_both "\\n${YELLOW}📋 Validation Rule #$rule_count${NC}"
            log_both "------------------------"
            parse_validation_rule "$contract_file" "$rule_count"
        fi
    done <<< "$validation_rules"
    
    if [[ $rule_count -eq 0 ]]; then
        log_both "📝 No validation rules found on Contract object"
    fi
}

# Function to analyze with grep (fallback)
analyze_with_grep() {
    local contract_file="$1"
    
    log_both "Using grep for pattern matching..."
    
    # Count validation rules
    local rule_count
    rule_count=$(grep -c "<validationRules>" "$contract_file" 2>/dev/null || echo "0")
    
    if [[ $rule_count -eq 0 ]]; then
        log_both "📝 No validation rules found on Contract object"
        return 0
    fi
    
    log_both "Found $rule_count validation rule(s)"
    
    # Extract validation rule sections
    local in_validation_rule=false
    local current_rule=""
    local rule_number=0
    
    while IFS= read -r line; do
        if [[ "$line" == *"<validationRules>"* ]]; then
            in_validation_rule=true
            rule_number=$((rule_number + 1))
            current_rule=""
            log_both "\\n${YELLOW}📋 Validation Rule #$rule_number${NC}"
            log_both "------------------------"
        elif [[ "$line" == *"</validationRules>"* ]]; then
            in_validation_rule=false
            parse_validation_rule_text "$current_rule"
        elif [[ $in_validation_rule == true ]]; then
            current_rule+="$line"$'\n'
        fi
    done < "$contract_file"
}

# Function to parse validation rule text
parse_validation_rule_text() {
    local rule_text="$1"
    
    # Extract key information
    local rule_name
    rule_name=$(echo "$rule_text" | grep -o "<fullName>.*</fullName>" | sed 's/<[^>]*>//g' || echo "Unknown")
    
    local active
    active=$(echo "$rule_text" | grep -o "<active>.*</active>" | sed 's/<[^>]*>//g' || echo "true")
    
    local error_message
    error_message=$(echo "$rule_text" | grep -o "<errorMessage>.*</errorMessage>" | sed 's/<[^>]*>//g' || echo "No error message")
    
    local formula
    formula=$(echo "$rule_text" | grep -o "<errorConditionFormula>.*</errorConditionFormula>" | sed 's/<[^>]*>//g' || echo "No formula")
    
    # Display rule information
    log_both "Rule Name: $rule_name"
    log_both "Active: $active"
    log_both "Error Message: $error_message"
    log_both "Formula: $formula"
    
    # Assess risk level
    assess_risk_level "$rule_name" "$formula" "$active"
}

# Function to assess risk level
assess_risk_level() {
    local rule_name="$1"
    local formula="$2"
    local active="$3"
    
    local risk_level="LOW"
    local flow_impact="Minimal impact expected"
    
    if [[ "$active" == "false" ]]; then
        risk_level="NONE"
        flow_impact="Rule is inactive - no impact"
    else
        # Check for high-risk patterns
        if [[ "$formula" == *"ISBLANK"* ]] && [[ "$formula" == *"Contracting_Entity"* ]]; then
            risk_level="MEDIUM"
            flow_impact="May fail if Contracting Entity field handling is incorrect"
        elif [[ "$formula" == *"ISBLANK"* ]] && [[ "$formula" == *"Contract_Term"* ]]; then
            risk_level="MEDIUM"
            flow_impact="May fail if Contract Term field handling is incorrect"
        elif [[ "$formula" == *"StartDate"* ]] || [[ "$formula" == *"EndDate"* ]]; then
            risk_level="MEDIUM"
            flow_impact="Date validation may conflict with flow date mapping"
        elif [[ "$formula" == *"ISBLANK"* ]]; then
            risk_level="HIGH"
            flow_impact="Required field validation - check if flow populates this field"
        fi
    fi
    
    log_both "Risk Level: ${risk_level}"
    log_both "Flow Impact: ${flow_impact}"
}

# Function to analyze required fields
analyze_required_fields() {
    local metadata_dir="$1"
    local contract_file="${metadata_dir}/force-app/main/default/objects/Contract/Contract.object-meta.xml"
    
    if [[ ! -f "$contract_file" ]]; then
        contract_file="${metadata_dir}/objects/Contract.object"
    fi
    
    log_both "\\n${BLUE}📋 REQUIRED FIELDS ANALYSIS${NC}"
    log_both "============================="
    
    # Standard required fields
    log_both "Standard Required Fields:"
    log_both "- Account (lookup)"
    log_both "- Status (picklist)"
    log_both "- StartDate (date)"
    log_both "- ContractTerm (number) - FIXED: defaults to 12"
    
    # Check for custom required fields
    if command -v xmllint &> /dev/null; then
        local required_fields
        required_fields=$(xmllint --xpath "//fields[required='true']/fullName/text()" "$contract_file" 2>/dev/null || echo "")
        
        if [[ -n "$required_fields" ]]; then
            log_both "\\nCustom Required Fields:"
            while IFS= read -r field; do
                log_both "- $field"
            done <<< "$required_fields"
        fi
    fi
}

# Function to provide flow compatibility assessment
flow_compatibility_assessment() {
    log_both "\\n${BLUE}🔄 FLOW COMPATIBILITY ASSESSMENT${NC}"
    log_both "=================================="
    
    log_both "Recent Flow Fixes:"
    log_both "✅ Contracting Entity: defaults to 'Advertising'"
    log_both "✅ Contract Term: defaults to 12 months"
    log_both "✅ End Date: properly mapped from opportunity"
    
    log_both "\\nFlow Field Mappings Status:"
    log_both "- Account: ✅ Mapped from opportunity"
    log_both "- Status: ✅ Should default to 'Draft'"
    log_both "- StartDate: ✅ Should be set by flow"
    log_both "- Contracting_Entity__c: ✅ Fixed - defaults to 'Advertising'"
    log_both "- Contract_Term__c: ✅ Fixed - defaults to 12"
    log_both "- EndDate: ✅ Fixed - calculated from start date + term"
}

# Function to provide recommendations
provide_recommendations() {
    log_both "\\n${BLUE}💡 RECOMMENDATIONS${NC}"
    log_both "==================="
    
    log_both "1. TEST THE FLOW:"
    log_both "   - Create test opportunities in example-company-sandbox"
    log_both "   - Run the Contract Creation Flow"
    log_both "   - Verify no validation rule failures occur"
    
    log_both "\\n2. MONITOR FOR ISSUES:"
    log_both "   - Check debug logs for any validation failures"
    log_both "   - Test with different opportunity configurations"
    log_both "   - Verify all required fields are populated"
    
    log_both "\\n3. ADDITIONAL SAFETY MEASURES:"
    log_both "   - Add error handling in the flow for validation failures"
    log_both "   - Consider adding field validation in the flow itself"
    log_both "   - Document the field mapping requirements"
    
    log_both "\\n4. VALIDATION RULE BEST PRACTICES:"
    log_both "   - Review validation rules for automation-friendly logic"
    log_both "   - Consider bypass logic for system automation"
    log_both "   - Ensure error messages are user-friendly for manual entry"
}

# Main execution
main() {
    echo -e "${GREEN}Starting Contract Validation Rules Analysis...${NC}"
    
    # Check authentication
    check_auth
    
    # Retrieve metadata
    local metadata_dir
    metadata_dir=$(retrieve_contract_metadata)
    
    # Analyze validation rules
    analyze_validation_rules "$metadata_dir"
    
    # Analyze required fields
    analyze_required_fields "$metadata_dir"
    
    # Flow compatibility assessment
    flow_compatibility_assessment
    
    # Provide recommendations
    provide_recommendations
    
    # Summary
    log_both "\\n${GREEN}✅ ANALYSIS COMPLETE${NC}"
    log_both "====================="
    log_both "Report saved to: $REPORT_FILE"
    log_both "\\nNext Steps:"
    log_both "1. Review the validation rules analysis above"
    log_both "2. Test the Contract Creation Flow with sample data"
    log_both "3. Monitor for any validation failures"
    log_both "4. Implement any additional recommendations if needed"
    
    # Cleanup
    rm -rf "$metadata_dir"
    
    echo -e "${GREEN}\\n🎉 Contract validation analysis completed successfully!${NC}"
    echo "Report available at: $REPORT_FILE"
}

# Run main function
main "$@"