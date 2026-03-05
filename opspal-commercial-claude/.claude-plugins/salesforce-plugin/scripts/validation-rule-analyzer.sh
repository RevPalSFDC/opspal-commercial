#!/bin/bash

##############################################################################
# Enhanced Validation Rule Analyzer
# 
# Discovers and analyzes Salesforce validation rules to identify business
# constraints, status transition blockers, and field dependencies
# 
# Enhanced based on Contract status validation issues
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CACHE_DIR="$PROJECT_ROOT/data/validation-rules"
CONFIG_DIR="$PROJECT_ROOT/config"
LOG_FILE="$PROJECT_ROOT/logs/validation-analyzer.log"
OUTPUT_DIR="$PROJECT_ROOT/output"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Default values
ANALYZE_TRANSITIONS=true
INCLUDE_INACTIVE=false
VERBOSE=false

# Ensure directories exist
mkdir -p "$CACHE_DIR" "$CONFIG_DIR" "$(dirname "$LOG_FILE")"

# Load environment
source "$PROJECT_ROOT/.env" 2>/dev/null || true

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to fetch validation rules for an object
fetch_validation_rules() {
    local object_name="$1"
    local cache_file="$CACHE_DIR/${object_name}_validation_rules.json"
    
    echo -e "${BLUE}↻ Fetching validation rules for $object_name...${NC}"
    
    # Query validation rules using tooling API (without ErrorConditionFormula which requires individual queries)
    local query="SELECT Id, ValidationName, Active, Description, ErrorMessage, ErrorDisplayField FROM ValidationRule WHERE EntityDefinition.QualifiedApiName='$object_name'"
    
    # Use SF CLI to query tooling API
    local result=$(sf data query --query "$query" --use-tooling-api --json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Store basic rule info
        echo "$result" | jq '.result.records' > "$cache_file"
        local count=$(jq '. | length' "$cache_file")
        
        # Now fetch formulas individually for each rule
        echo -e "${BLUE}↻ Fetching formulas for validation rules...${NC}"
        local rules_with_formulas=$(jq -c '.[]' "$cache_file")
        local enhanced_rules="[]"
        
        while IFS= read -r rule; do
            local rule_id=$(echo "$rule" | jq -r '.Id')
            local formula=$(fetch_validation_formula "$rule_id")
            
            if [ -n "$formula" ]; then
                # Add formula to rule object
                rule=$(echo "$rule" | jq --arg formula "$formula" '. + {ErrorConditionFormula: $formula}')
            fi
            enhanced_rules=$(echo "$enhanced_rules" | jq ". + [$rule]")
        done <<< "$rules_with_formulas"
        
        # Save enhanced rules with formulas
        echo "$enhanced_rules" > "$cache_file"
        
        echo -e "${GREEN}✓ Found $count validation rules for $object_name${NC}"
        log_message "Fetched $count validation rules for $object_name"
        return 0
    else
        echo -e "${RED}✗ Failed to fetch validation rules${NC}"
        log_message "ERROR: Failed to fetch validation rules for $object_name"
        return 1
    fi
}

# Function to fetch individual validation rule formula
fetch_validation_formula() {
    local rule_id="$1"
    
    # Query individual rule for Metadata field (contains formula)
    local query="SELECT Id, Metadata FROM ValidationRule WHERE Id='$rule_id'"
    local result=$(sf data query --query "$query" --use-tooling-api --json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Extract ErrorConditionFormula from Metadata
        echo "$result" | jq -r '.result.records[0].Metadata.errorConditionFormula // ""'
    fi
}

# Function to analyze validation rule formula
analyze_formula() {
    local formula="$1"
    local object_name="$2"
    
    # Extract required fields from formula
    local required_fields=$(echo "$formula" | grep -oE '\b[A-Za-z_][A-Za-z0-9_]*__c\b' | sort -u)
    
    # Detect common patterns
    local patterns=()
    
    # Check for ISBLANK/ISNULL patterns (required fields)
    if echo "$formula" | grep -qE 'ISBLANK|ISNULL'; then
        patterns+=("Required Field Check")
    fi
    
    # Check for ISPICKVAL patterns
    if echo "$formula" | grep -q 'ISPICKVAL'; then
        patterns+=("Picklist Value Check")
    fi
    
    # Check for date comparisons
    if echo "$formula" | grep -qE 'TODAY\(\)|NOW\(\)|DATE'; then
        patterns+=("Date Validation")
    fi
    
    # Check for numeric comparisons
    if echo "$formula" | grep -qE '[<>]=?|!='; then
        patterns+=("Numeric/Comparison Check")
    fi
    
    # Check for record type checks
    if echo "$formula" | grep -qE 'RecordType\.Name|RecordTypeId'; then
        patterns+=("Record Type Specific")
    fi
    
    # Check for profile/user checks
    if echo "$formula" | grep -qE '\$User\.|Profile\.Name'; then
        patterns+=("User/Profile Specific")
    fi
    
    # Check for stage/status checks
    if echo "$formula" | grep -qE 'ISPICKVAL.*Stage|ISPICKVAL.*Status'; then
        patterns+=("Stage/Status Dependent")
    fi
    
    # CRITICAL: Check for PRIORVALUE (status transition blocker)
    if echo "$formula" | grep -q 'PRIORVALUE'; then
        patterns+=("❗ STATUS TRANSITION BLOCKER - Uses PRIORVALUE")
        
        # Extract specific transition blocks
        if echo "$formula" | grep -qE "PRIORVALUE\s*\(\s*Status"; then
            patterns+=("❗ Blocks Status field changes")
        fi
    fi
    
    # CRITICAL: Check for ISCHANGED (field change restriction)
    if echo "$formula" | grep -q 'ISCHANGED'; then
        patterns+=("⚠️ FIELD CHANGE RESTRICTION - Uses ISCHANGED")
        
        # Check if it's on Status field
        if echo "$formula" | grep -qE "ISCHANGED\s*\(\s*Status"; then
            patterns+=("⚠️ Restricts Status field modifications")
        fi
    fi
    
    echo "$required_fields"
    echo "---PATTERNS---"
    printf '%s\n' "${patterns[@]}"
}

# New function to detect status transition blockers
detect_transition_blockers() {
    local formula="$1"
    local rule_name="$2"
    local blockers=()
    
    # Check for PRIORVALUE on Status
    if echo "$formula" | grep -qE "PRIORVALUE\s*\(\s*Status"; then
        blockers+=("Rule '$rule_name' blocks status transitions")
        
        # Try to extract specific blocked transitions
        # Pattern: PRIORVALUE(Status) = 'X' && Status = 'Y'
        local from_status=$(echo "$formula" | sed -n "s/.*PRIORVALUE.*Status.*=.*'\([^']*\)'.*/\1/p" | head -1)
        local to_status=$(echo "$formula" | sed -n "s/.*[^R]Status.*=.*'\([^']*\)'.*/\1/p" | head -1)
        
        if [[ -n "$from_status" ]] && [[ -n "$to_status" ]]; then
            blockers+=("  Specifically blocks: $from_status → $to_status")
        fi
        
        # Common pattern: Can't go back from Activated
        if echo "$formula" | grep -qE "PRIORVALUE.*Status.*=.*'Activated'.*Status.*<>.*'Activated'"; then
            blockers+=("  Prevents changing from 'Activated' status")
        fi
    fi
    
    # Check for ISCHANGED on Status with conditions
    if echo "$formula" | grep -qE "ISCHANGED\s*\(\s*Status"; then
        blockers+=("Rule '$rule_name' restricts when status can be changed")
    fi
    
    printf '%s\n' "${blockers[@]}"
}

# Function to generate bypass strategy
generate_bypass_strategy() {
    local object_name="$1"
    local rule_name="$2"
    local formula="$3"
    local error_message="$4"
    
    local analysis=$(analyze_formula "$formula" "$object_name")
    local required_fields=$(echo "$analysis" | sed -n '1,/---PATTERNS---/p' | grep -v "---PATTERNS---")
    local patterns=$(echo "$analysis" | sed -n '/---PATTERNS---/,$p' | grep -v "---PATTERNS---")
    
    local strategy=""
    local safe_values=""
    
    # Generate strategy based on patterns
    if echo "$patterns" | grep -q "Required Field Check"; then
        strategy="Provide default values for required fields"
        
        # Suggest safe defaults for common field types
        while IFS= read -r field; do
            if [[ "$field" == *"Date"* ]] || [[ "$field" == *"_Date__c" ]]; then
                safe_values="${safe_values}${field}=$(date +%Y-%m-%d)\n"
            elif [[ "$field" == *"Amount"* ]] || [[ "$field" == *"Price"* ]] || [[ "$field" == *"Cost"* ]]; then
                safe_values="${safe_values}${field}=0\n"
            elif [[ "$field" == *"Score"* ]] || [[ "$field" == *"Rating"* ]]; then
                safe_values="${safe_values}${field}=0\n"
            elif [[ "$field" == *"Email"* ]]; then
                safe_values="${safe_values}${field}=placeholder@example.com\n"
            elif [[ "$field" == *"Phone"* ]]; then
                safe_values="${safe_values}${field}=000-000-0000\n"
            else
                safe_values="${safe_values}${field}=TBD\n"
            fi
        done <<< "$required_fields"
    fi
    
    if echo "$patterns" | grep -q "Picklist Value Check"; then
        strategy="${strategy}\nEnsure picklist values match allowed values"
    fi
    
    if echo "$patterns" | grep -q "Date Validation"; then
        strategy="${strategy}\nUse appropriate date values (future/past as required)"
    fi
    
    if echo "$patterns" | grep -q "Record Type Specific"; then
        strategy="${strategy}\nCheck record type requirements"
    fi
    
    if echo "$patterns" | grep -q "Stage/Status Dependent"; then
        strategy="${strategy}\nSet appropriate stage/status before other fields"
    fi
    
    echo "$strategy"
    echo "---VALUES---"
    echo -e "$safe_values"
}

# Function to create safe defaults configuration
create_safe_defaults() {
    local object_name="$1"
    local output_file="$CONFIG_DIR/safe_defaults_${object_name}.json"
    local cache_file="$CACHE_DIR/${object_name}_validation_rules.json"
    
    if [ ! -f "$cache_file" ]; then
        fetch_validation_rules "$object_name"
    fi
    
    echo -e "${BLUE}Generating safe defaults for $object_name...${NC}"
    
    # Start JSON structure
    echo "{" > "$output_file"
    echo "  \"object\": \"$object_name\"," >> "$output_file"
    echo "  \"generated\": \"$(date -Iseconds)\"," >> "$output_file"
    echo "  \"defaults\": {" >> "$output_file"
    
    # Collect all required fields from all rules
    local all_fields=()
    local field_defaults=()
    
    jq -r '.[] | select(.Active == true)' "$cache_file" 2>/dev/null | while IFS= read -r rule; do
        local formula=$(echo "$rule" | jq -r '.ErrorConditionFormula')
        local fields=$(echo "$formula" | grep -oE '\b[A-Za-z_][A-Za-z0-9_]*__c\b' | sort -u)
        
        while IFS= read -r field; do
            [ -z "$field" ] && continue
            
            # Determine safe default based on field name patterns
            local default_value=""
            
            if [[ "$field" == *"Date"* ]]; then
                default_value="TODAY()"
            elif [[ "$field" == *"Amount"* ]] || [[ "$field" == *"Price"* ]]; then
                default_value="0"
            elif [[ "$field" == *"Percent"* ]] || [[ "$field" == *"Rate"* ]]; then
                default_value="0"
            elif [[ "$field" == *"Email"* ]]; then
                default_value="placeholder@example.com"
            elif [[ "$field" == *"Phone"* ]]; then
                default_value="000-000-0000"
            elif [[ "$field" == *"Score"* ]] || [[ "$field" == *"Rating"* ]]; then
                default_value="0"
            elif [[ "$field" == *"Reason"* ]] || [[ "$field" == *"Description"* ]]; then
                default_value="Data Migration"
            elif [[ "$field" == *"Type"* ]] || [[ "$field" == *"Status"* ]]; then
                default_value="__CHECK_PICKLIST__"
            else
                default_value="TBD"
            fi
            
            field_defaults+=("    \"$field\": \"$default_value\"")
        done <<< "$fields"
    done
    
    # Write unique field defaults
    printf '%s,\n' "${field_defaults[@]}" | sort -u | sed '$ s/,$//' >> "$output_file"
    
    echo "  }," >> "$output_file"
    
    # Add validation rules summary
    echo "  \"validationRules\": [" >> "$output_file"
    
    jq -r '.[] | select(.Active == true) | 
        "    {\"name\": \"" + .ValidationName + 
        "\", \"active\": " + (.Active | tostring) + 
        ", \"errorMessage\": \"" + .ErrorMessage + "\"}"' "$cache_file" 2>/dev/null | \
        sed '$ ! s/$/,/' >> "$output_file"
    
    echo "  ]" >> "$output_file"
    echo "}" >> "$output_file"
    
    echo -e "${GREEN}✓ Safe defaults created: $output_file${NC}"
    log_message "Created safe defaults for $object_name"
}

# Function to analyze validation rule impact
analyze_impact() {
    local object_name="$1"
    local cache_file="$CACHE_DIR/${object_name}_validation_rules.json"
    
    if [ ! -f "$cache_file" ]; then
        fetch_validation_rules "$object_name"
    fi
    
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}    Validation Rule Impact Analysis - $object_name${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"
    
    # Count active vs inactive
    local total=$(jq '. | length' "$cache_file")
    local active=$(jq '[.[] | select(.Active == true)] | length' "$cache_file")
    local inactive=$((total - active))
    
    echo "Total Rules: $total"
    echo -e "${GREEN}Active: $active${NC}"
    echo -e "${YELLOW}Inactive: $inactive${NC}"
    echo ""
    
    # CRITICAL: Check for status transition blockers
    echo -e "${RED}🚨 STATUS TRANSITION BLOCKERS:${NC}"
    local has_blockers=false
    
    jq -c '.[] | select(.Active == true)' "$cache_file" | while IFS= read -r rule; do
        local name=$(echo "$rule" | jq -r '.ValidationName')
        local formula=$(echo "$rule" | jq -r '.ErrorConditionFormula')
        local error_msg=$(echo "$rule" | jq -r '.ErrorMessage')
        
        local blockers=$(detect_transition_blockers "$formula" "$name")
        if [[ -n "$blockers" ]]; then
            has_blockers=true
            echo -e "${RED}$blockers${NC}"
            echo -e "  ${YELLOW}→ Error: $error_msg${NC}\n"
        fi
    done
    
    if [[ "$has_blockers" == "false" ]]; then
        echo -e "${GREEN}  ✓ No status transition blockers detected${NC}"
    fi
    echo ""
    
    # Analyze patterns
    echo -e "${CYAN}Pattern Analysis:${NC}"
    
    local required_count=0
    local picklist_count=0
    local date_count=0
    local user_count=0
    local stage_count=0
    
    jq -r '.[] | select(.Active == true) | .ErrorConditionFormula' "$cache_file" 2>/dev/null | while IFS= read -r formula; do
        if echo "$formula" | grep -qE 'ISBLANK|ISNULL'; then
            ((required_count++))
        fi
        if echo "$formula" | grep -q 'ISPICKVAL'; then
            ((picklist_count++))
        fi
        if echo "$formula" | grep -qE 'TODAY\(\)|DATE'; then
            ((date_count++))
        fi
        if echo "$formula" | grep -q '\$User'; then
            ((user_count++))
        fi
        if echo "$formula" | grep -qE 'Stage|Status'; then
            ((stage_count++))
        fi
    done
    
    echo "  Required field validations: $required_count"
    echo "  Picklist validations: $picklist_count"
    echo "  Date validations: $date_count"
    echo "  User/Profile specific: $user_count"
    echo "  Stage/Status dependent: $stage_count"
    
    # List high-impact rules
    echo -e "\n${MAGENTA}High Impact Rules:${NC}"
    jq -r '.[] | select(.Active == true) | 
        select(.ErrorConditionFormula | test("ISBLANK|ISNULL|REQUIRED")) |
        "  • " + .ValidationName + ": " + .ErrorMessage' "$cache_file" 2>/dev/null | head -5
}

# Function to generate bypass script
generate_bypass_script() {
    local object_name="$1"
    local output_script="$PROJECT_ROOT/scripts/bypass_${object_name}_validation.sh"
    local defaults_file="$CONFIG_DIR/safe_defaults_${object_name}.json"
    
    if [ ! -f "$defaults_file" ]; then
        create_safe_defaults "$object_name"
    fi
    
    echo -e "${BLUE}Generating bypass script for $object_name...${NC}"
    
    cat > "$output_script" << 'EOF'
#!/bin/bash

# Auto-generated validation bypass script
# Object: OBJECT_NAME
# Generated: TIMESTAMP

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULTS_FILE="$PROJECT_ROOT/config/safe_defaults_OBJECT_NAME.json"

# Load defaults
if [ ! -f "$DEFAULTS_FILE" ]; then
    echo "Error: Defaults file not found"
    exit 1
fi

# Function to apply safe defaults to CSV
apply_defaults_to_csv() {
    local csv_file="$1"
    local output_file="${csv_file%.csv}_with_defaults.csv"
    
    echo "Applying safe defaults to $csv_file..."
    
    # Get field defaults
    local defaults=$(jq -r '.defaults | to_entries | .[] | .key + "=" + .value' "$DEFAULTS_FILE")
    
    # Create a temporary Python script to handle CSV manipulation
    cat > ${TEMP_DIR:-/tmp} << 'PYTHON'
import csv
import json
import sys

csv_file = sys.argv[1]
output_file = sys.argv[2]
defaults_file = sys.argv[3]

with open(defaults_file, 'r') as f:
    config = json.load(f)
    defaults = config['defaults']

with open(csv_file, 'r') as infile, open(output_file, 'w', newline='') as outfile:
    reader = csv.DictReader(infile)
    
    # Add missing columns if needed
    fieldnames = reader.fieldnames.copy()
    for field in defaults.keys():
        if field not in fieldnames:
            fieldnames.append(field)
    
    writer = csv.DictWriter(outfile, fieldnames=fieldnames)
    writer.writeheader()
    
    for row in reader:
        # Apply defaults for empty fields
        for field, default_value in defaults.items():
            if field not in row or not row[field]:
                if default_value == "TODAY()":
                    from datetime import date
                    row[field] = date.today().isoformat()
                elif default_value != "__CHECK_PICKLIST__":
                    row[field] = default_value
        
        writer.writerow(row)

print(f"Created {output_file} with safe defaults")
PYTHON
    
    python3 ${TEMP_DIR:-/tmp} "$csv_file" "$output_file" "$DEFAULTS_FILE"
    rm ${TEMP_DIR:-/tmp}
    
    echo "Output: $output_file"
}

# Main execution
if [ $# -eq 0 ]; then
    echo "Usage: $0 <csv_file>"
    echo ""
    echo "This script applies safe default values to bypass validation rules"
    echo "for OBJECT_NAME records during data import."
    exit 1
fi

apply_defaults_to_csv "$1"
EOF
    
    # Replace placeholders
    sed -i "s/OBJECT_NAME/$object_name/g" "$output_script"
    sed -i "s/TIMESTAMP/$(date -Iseconds)/g" "$output_script"
    
    chmod +x "$output_script"
    
    echo -e "${GREEN}✓ Bypass script created: $output_script${NC}"
    log_message "Generated bypass script for $object_name"
}

# Function to test validation rules
test_validation_rules() {
    local object_name="$1"
    local test_data="${2:-}"
    
    echo -e "${BLUE}Testing validation rules for $object_name...${NC}"
    
    # Create test record with minimal data
    local test_record="{}"
    
    if [ -n "$test_data" ]; then
        test_record="$test_data"
    fi
    
    # Try to create record and capture validation errors
    local result=$(echo "$test_record" | sf data create record --sobject "$object_name" --json 2>&1)
    
    if echo "$result" | grep -q "FIELD_CUSTOM_VALIDATION_EXCEPTION"; then
        echo -e "${YELLOW}Validation errors detected:${NC}"
        echo "$result" | jq -r '.message' 2>/dev/null || echo "$result"
        
        # Extract field requirements from error
        local required_fields=$(echo "$result" | grep -oE 'Required fields are missing: \[[^\]]+\]' | \
                               grep -oE '\[([^\]]+)\]' | tr -d '[]' | tr ',' '\n')
        
        if [ -n "$required_fields" ]; then
            echo -e "\n${CYAN}Required fields:${NC}"
            echo "$required_fields" | while IFS= read -r field; do
                echo "  • $field"
            done
        fi
    elif echo "$result" | grep -q "success"; then
        echo -e "${GREEN}✓ Test record created successfully${NC}"
        
        # Delete test record
        local record_id=$(echo "$result" | jq -r '.id')
        sf data delete record --sobject "$object_name" --record-id "$record_id" 2>/dev/null
    else
        echo -e "${RED}✗ Unexpected error:${NC}"
        echo "$result"
    fi
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}═══ Validation Rule Analyzer ═══${NC}"
    echo "1) Fetch validation rules"
    echo "2) Analyze impact"
    echo "3) Create safe defaults"
    echo "4) Generate bypass script"
    echo "5) Test validation rules"
    echo "6) Full analysis (all steps)"
    echo "7) Clear cache"
    echo "8) Exit"
    echo -n "Select option: "
}

# Interactive mode
interactive_mode() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                echo -n "Object name: "
                read -r object
                fetch_validation_rules "$object"
                ;;
            2)
                echo -n "Object name: "
                read -r object
                analyze_impact "$object"
                ;;
            3)
                echo -n "Object name: "
                read -r object
                create_safe_defaults "$object"
                ;;
            4)
                echo -n "Object name: "
                read -r object
                generate_bypass_script "$object"
                ;;
            5)
                echo -n "Object name: "
                read -r object
                test_validation_rules "$object"
                ;;
            6)
                echo -n "Object name: "
                read -r object
                fetch_validation_rules "$object"
                analyze_impact "$object"
                create_safe_defaults "$object"
                generate_bypass_script "$object"
                ;;
            7)
                rm -rf "$CACHE_DIR"/*
                echo -e "${GREEN}✓ Cache cleared${NC}"
                ;;
            8)
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
    done
}

# Command line mode
if [ $# -eq 0 ]; then
    interactive_mode
else
    case "$1" in
        fetch)
            fetch_validation_rules "$2"
            ;;
        analyze)
            analyze_impact "$2"
            ;;
        defaults)
            create_safe_defaults "$2"
            ;;
        bypass)
            generate_bypass_script "$2"
            ;;
        test)
            test_validation_rules "$2" "${3:-}"
            ;;
        full)
            fetch_validation_rules "$2"
            analyze_impact "$2"
            create_safe_defaults "$2"
            generate_bypass_script "$2"
            ;;
        clear)
            rm -rf "$CACHE_DIR"/*
            echo -e "${GREEN}✓ Cache cleared${NC}"
            ;;
        *)
            echo "Usage: $0 {fetch|analyze|defaults|bypass|test|full|clear} [object]"
            echo ""
            echo "Commands:"
            echo "  fetch <object>    - Fetch validation rules"
            echo "  analyze <object>  - Analyze rule impact"
            echo "  defaults <object> - Create safe defaults config"
            echo "  bypass <object>   - Generate bypass script"
            echo "  test <object>     - Test validation rules"
            echo "  full <object>     - Run full analysis"
            echo "  clear             - Clear cache"
            exit 1
            ;;
    esac
fi