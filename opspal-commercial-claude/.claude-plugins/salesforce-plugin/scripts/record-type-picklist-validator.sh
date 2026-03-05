#!/bin/bash

##############################################################################
# record-type-picklist-validator.sh - Record Type Picklist Restriction Validator
##############################################################################
# Validates picklist values against record type restrictions before bulk operations
# Prevents "bad value for restricted picklist" errors by detecting incompatibilities
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CACHE_DIR="${SCRIPT_DIR}/../.record-type-cache"
RT_DB="${CACHE_DIR}/record_types.db"
LOG_FILE="${CACHE_DIR}/validator.log"

# Source common functions if available
[[ -f "${SCRIPT_DIR}/lib/shell-commons.sh" ]] && source "${SCRIPT_DIR}/lib/shell-commons.sh"

# Source MCP adapter if available (NEW)
if [[ -f "${SCRIPT_DIR}/lib/mcp-adapter.sh" ]]; then
    source "${SCRIPT_DIR}/lib/mcp-adapter.sh"
    init_mcp_adapter
fi

# Create directories
mkdir -p "$CACHE_DIR"

# Initialize SQLite database
init_database() {
    sqlite3 "$RT_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS record_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias TEXT NOT NULL,
    object_name TEXT NOT NULL,
    record_type_id TEXT NOT NULL,
    record_type_name TEXT NOT NULL,
    developer_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_alias, object_name, record_type_id)
);

CREATE TABLE IF NOT EXISTS picklist_restrictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias TEXT NOT NULL,
    object_name TEXT NOT NULL,
    record_type_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    allowed_values TEXT,  -- JSON array of allowed values
    restricted_values TEXT,  -- JSON array of restricted values
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_alias, object_name, record_type_id, field_name)
);

CREATE TABLE IF NOT EXISTS validation_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    validation_id TEXT NOT NULL,
    csv_file TEXT NOT NULL,
    object_name TEXT NOT NULL,
    total_records INTEGER,
    valid_records INTEGER,
    invalid_records INTEGER,
    issues TEXT,  -- JSON array of issues
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rt_org_object ON record_types(org_alias, object_name);
CREATE INDEX IF NOT EXISTS idx_pr_org_object ON picklist_restrictions(org_alias, object_name, record_type_id);
CREATE INDEX IF NOT EXISTS idx_vr_validation ON validation_results(validation_id);
EOF
    
    echo -e "${GREEN}Database initialized${NC}"
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    fetch       Fetch record types and picklist restrictions
    validate    Validate CSV file against record type restrictions
    analyze     Analyze picklist compatibility for an object
    split       Split CSV by record type compatibility
    fix         Apply automatic fixes to CSV
    report      Generate validation report
    cache       Manage cached data

Options:
    -o OBJECT       Salesforce object name
    -a ALIAS        Org alias
    -f FILE         CSV file to validate
    -r RTID         Record Type ID
    -c COLUMN       Column name for record type
    -v              Verbose output
    -h              Display this help

Examples:
    # Fetch record types for Opportunity
    $0 fetch -o Opportunity -a myorg

    # Validate CSV file
    $0 validate -f opportunities.csv -o Opportunity -a myorg

    # Split CSV by compatible record types
    $0 split -f data.csv -o Account -a myorg

    # Analyze picklist restrictions
    $0 analyze -o Opportunity -a myorg

EOF
    exit 1
}

# Function to log messages
log_message() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    
    case "$level" in
        ERROR)   echo -e "${RED}[ERROR]${NC} $message" ;;
        WARNING) echo -e "${YELLOW}[WARNING]${NC} $message" ;;
        INFO)    echo -e "${BLUE}[INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
    esac
}

# Function to fetch record types
fetch_record_types() {
    local object="$1"
    local org_alias="$2"
    
    log_message INFO "Fetching record types for $object..."
    
    # Use MCP if available (NEW)
    if [[ "$MCP_AVAILABLE" == true ]]; then
        local response=$(mcp_get_record_types "$object" "$org_alias")
    else
        # Query record types using CLI
        local query="SELECT Id, Name, DeveloperName, IsActive FROM RecordType WHERE SobjectType = '${object}'"
        
        local cmd="sf data query --query \"$query\" --json"
        [[ -n "$org_alias" ]] && cmd="$cmd --target-org $org_alias"
        
        local response=$($cmd 2>/dev/null)
    fi
    
    if [[ $? -ne 0 ]]; then
        log_message ERROR "Failed to fetch record types"
        return 1
    fi
    
    # Check for default record type
    local default_rt_query="SELECT RecordTypeId FROM Profile WHERE Name = 'System Administrator' LIMIT 1"
    
    # Parse and store record types
    echo "$response" | jq -r '.result.records[] | @json' | while read -r rt; do
        local rt_id=$(echo "$rt" | jq -r '.Id')
        local rt_name=$(echo "$rt" | jq -r '.Name')
        local dev_name=$(echo "$rt" | jq -r '.DeveloperName')
        local is_active=$(echo "$rt" | jq -r '.IsActive')
        
        # Check if this is the default
        local is_default=0
        [[ "$rt_name" == "Default" || "$dev_name" == "Default" ]] && is_default=1
        
        sqlite3 "$RT_DB" << EOF
INSERT OR REPLACE INTO record_types 
(org_alias, object_name, record_type_id, record_type_name, developer_name, is_active, is_default, last_updated)
VALUES ('$org_alias', '$object', '$rt_id', '$rt_name', '$dev_name', $is_active, $is_default, CURRENT_TIMESTAMP);
EOF
        
        # Fetch picklist restrictions for this record type
        fetch_picklist_restrictions "$object" "$org_alias" "$rt_id"
    done
    
    log_message SUCCESS "Record types cached successfully"
}

# Function to fetch picklist restrictions
fetch_picklist_restrictions() {
    local object="$1"
    local org_alias="$2"
    local rt_id="$3"
    
    log_message INFO "Fetching picklist restrictions for record type $rt_id..."
    
    # Get all picklist fields for the object
    local field_query="SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}' AND DataType IN ('Picklist', 'MultiselectPicklist')"
    
    local cmd="sf data query --query \"$field_query\" --use-tooling-api --json"
    [[ -n "$org_alias" ]] && cmd="$cmd --target-org $org_alias"
    
    local fields_response=$($cmd 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        echo "$fields_response" | jq -r '.result.records[].QualifiedApiName' | while read -r field; do
            # Query picklist values for this record type
            local values_query="SELECT Label, Value, IsActive FROM PicklistValueInfo WHERE EntityParticleId IN (SELECT Id FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND QualifiedApiName = '${field}') AND (RecordTypeId = '${rt_id}' OR RecordTypeId = null)"
            
            local values_cmd="sf data query --query \"$values_query\" --use-tooling-api --json"
            [[ -n "$org_alias" ]] && values_cmd="$values_cmd --target-org $org_alias"
            
            local values_response=$($values_cmd 2>/dev/null)
            
            if [[ $? -eq 0 ]]; then
                # Extract allowed values
                local allowed_values=$(echo "$values_response" | jq -c '[.result.records[] | select(.IsActive == true) | .Value]')
                local restricted_values=$(echo "$values_response" | jq -c '[.result.records[] | select(.IsActive == false) | .Value]')
                
                sqlite3 "$RT_DB" << EOF
INSERT OR REPLACE INTO picklist_restrictions 
(org_alias, object_name, record_type_id, field_name, allowed_values, restricted_values, last_updated)
VALUES ('$org_alias', '$object', '$rt_id', '$field', '$allowed_values', '$restricted_values', CURRENT_TIMESTAMP);
EOF
            fi
        done
    fi
}

# Function to validate CSV against record type restrictions
validate_csv() {
    local csv_file="$1"
    local object="$2"
    local org_alias="$3"
    local rt_column="${4:-RecordTypeId}"
    
    [[ ! -f "$csv_file" ]] && { log_message ERROR "CSV file not found: $csv_file"; return 1; }
    
    log_message INFO "Validating CSV file against record type restrictions..."
    
    # Generate validation ID
    local validation_id=$(date +%s)_$(basename "$csv_file" .csv)
    
    # Read CSV headers
    local headers=$(head -1 "$csv_file")
    
    # Initialize counters
    local total_records=0
    local valid_records=0
    local invalid_records=0
    local issues="[]"
    
    # Process each record
    tail -n +2 "$csv_file" | while IFS=',' read -r line; do
        total_records=$((total_records + 1))
        local record_valid=true
        local record_issues=""
        
        # Extract record type from line
        local rt_value=""
        if echo "$headers" | grep -q "$rt_column"; then
            # Get column index
            local rt_index=$(echo "$headers" | tr ',' '\n' | grep -n "^${rt_column}$" | cut -d: -f1)
            rt_value=$(echo "$line" | cut -d',' -f"$rt_index")
        fi
        
        # Default to Default record type if not specified
        [[ -z "$rt_value" ]] && rt_value="Default"
        
        # Get record type ID
        local rt_id=$(sqlite3 "$RT_DB" "SELECT record_type_id FROM record_types WHERE org_alias='$org_alias' AND object_name='$object' AND (record_type_name='$rt_value' OR developer_name='$rt_value' OR record_type_id='$rt_value') LIMIT 1")
        
        if [[ -z "$rt_id" ]]; then
            record_valid=false
            record_issues="Invalid record type: $rt_value"
        else
            # Check each picklist field
            echo "$headers" | tr ',' '\n' | while read -r field; do
                # Check if this is a picklist field with restrictions
                local restrictions=$(sqlite3 "$RT_DB" "SELECT allowed_values FROM picklist_restrictions WHERE org_alias='$org_alias' AND object_name='$object' AND record_type_id='$rt_id' AND field_name='$field'")
                
                if [[ -n "$restrictions" ]] && [[ "$restrictions" != "null" ]]; then
                    # Get field value from line
                    local field_index=$(echo "$headers" | tr ',' '\n' | grep -n "^${field}$" | cut -d: -f1)
                    local field_value=$(echo "$line" | cut -d',' -f"$field_index")
                    
                    # Check if value is allowed
                    if [[ -n "$field_value" ]] && ! echo "$restrictions" | jq -e ".[] | select(. == \"$field_value\")" > /dev/null 2>&1; then
                        record_valid=false
                        record_issues="${record_issues}Field $field has restricted value '$field_value' for record type $rt_value; "
                    fi
                fi
            done
        fi
        
        if [[ "$record_valid" == true ]]; then
            valid_records=$((valid_records + 1))
        else
            invalid_records=$((invalid_records + 1))
            issues=$(echo "$issues" | jq ". += [{\"row\": $total_records, \"issues\": \"$record_issues\"}]")
        fi
    done
    
    # Store validation results
    sqlite3 "$RT_DB" << EOF
INSERT INTO validation_results 
(validation_id, csv_file, object_name, total_records, valid_records, invalid_records, issues, created_at)
VALUES ('$validation_id', '$csv_file', '$object', $total_records, $valid_records, $invalid_records, '$issues', CURRENT_TIMESTAMP);
EOF
    
    # Display results
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     CSV Validation Results               ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}File:${NC} $csv_file"
    echo -e "${BLUE}Object:${NC} $object"
    echo -e "${BLUE}Total Records:${NC} $total_records"
    echo -e "${GREEN}Valid Records:${NC} $valid_records"
    echo -e "${RED}Invalid Records:${NC} $invalid_records"
    
    if [[ $invalid_records -gt 0 ]]; then
        echo ""
        echo -e "${YELLOW}Issues Found:${NC}"
        echo "$issues" | jq -r '.[] | "Row \(.row): \(.issues)"'
        
        echo ""
        echo -e "${CYAN}Suggested Fixes:${NC}"
        suggest_fixes "$validation_id"
    else
        echo ""
        echo -e "${GREEN}✓ All records are compatible with their record types${NC}"
    fi
    
    return $([ $invalid_records -eq 0 ])
}

# Function to suggest fixes
suggest_fixes() {
    local validation_id="$1"
    
    echo "1. Update record types to match picklist values"
    echo "2. Split CSV into separate files by record type"
    echo "3. Enable missing picklist values on record types (requires admin)"
    echo "4. Transform incompatible values to allowed alternatives"
    echo ""
    echo "Run: $0 fix -v $validation_id -m [1-4] to apply a fix"
}

# Function to split CSV by record type compatibility
split_csv() {
    local csv_file="$1"
    local object="$2"
    local org_alias="$3"
    
    log_message INFO "Splitting CSV by record type compatibility..."
    
    # Create output directory
    local output_dir="${csv_file%.csv}_split"
    mkdir -p "$output_dir"
    
    # Read headers
    local headers=$(head -1 "$csv_file")
    
    # Get unique record types from database
    sqlite3 "$RT_DB" "SELECT record_type_id, record_type_name FROM record_types WHERE org_alias='$org_alias' AND object_name='$object'" | while IFS='|' read -r rt_id rt_name; do
        local output_file="${output_dir}/${rt_name// /_}.csv"
        echo "$headers" > "$output_file"
        
        log_message INFO "Creating file for record type: $rt_name"
    done
    
    # Process each record and assign to appropriate file
    tail -n +2 "$csv_file" | while IFS=',' read -r line; do
        # Determine best record type for this record
        local best_rt=$(determine_best_record_type "$line" "$headers" "$object" "$org_alias")
        
        if [[ -n "$best_rt" ]]; then
            local rt_name=$(sqlite3 "$RT_DB" "SELECT record_type_name FROM record_types WHERE record_type_id='$best_rt'")
            local output_file="${output_dir}/${rt_name// /_}.csv"
            echo "$line" >> "$output_file"
        fi
    done
    
    log_message SUCCESS "CSV split into $(ls -1 "$output_dir"/*.csv | wc -l) files in $output_dir"
}

# Function to determine best record type for a record
determine_best_record_type() {
    local line="$1"
    local headers="$2"
    local object="$3"
    local org_alias="$4"
    
    # Logic to determine the most compatible record type
    # Returns the record type ID that allows all picklist values in the record
    
    # For now, return default record type
    sqlite3 "$RT_DB" "SELECT record_type_id FROM record_types WHERE org_alias='$org_alias' AND object_name='$object' AND is_default=1 LIMIT 1"
}

# Function to analyze picklist compatibility
analyze_picklist_compatibility() {
    local object="$1"
    local org_alias="$2"
    
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   Picklist Compatibility Analysis       ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${BLUE}Object:${NC} $object"
    echo -e "${BLUE}Org:${NC} $org_alias"
    echo ""
    
    # Show record types
    echo -e "${YELLOW}Record Types:${NC}"
    sqlite3 -column -header "$RT_DB" << EOF
SELECT record_type_name as "Record Type", 
       CASE WHEN is_active=1 THEN 'Active' ELSE 'Inactive' END as Status,
       CASE WHEN is_default=1 THEN 'Yes' ELSE 'No' END as "Default"
FROM record_types 
WHERE org_alias='$org_alias' AND object_name='$object'
ORDER BY is_default DESC, record_type_name;
EOF
    
    echo ""
    echo -e "${YELLOW}Picklist Restrictions by Record Type:${NC}"
    
    # Show restrictions for each record type
    sqlite3 "$RT_DB" "SELECT DISTINCT record_type_id, field_name FROM picklist_restrictions WHERE org_alias='$org_alias' AND object_name='$object'" | while IFS='|' read -r rt_id field; do
        local rt_name=$(sqlite3 "$RT_DB" "SELECT record_type_name FROM record_types WHERE record_type_id='$rt_id'")
        local allowed=$(sqlite3 "$RT_DB" "SELECT allowed_values FROM picklist_restrictions WHERE record_type_id='$rt_id' AND field_name='$field'")
        
        echo ""
        echo -e "${GREEN}$rt_name - $field:${NC}"
        if [[ "$allowed" != "null" ]] && [[ -n "$allowed" ]]; then
            echo "$allowed" | jq -r '.[]' | sed 's/^/  • /'
        else
            echo "  All values allowed"
        fi
    done
}

# Function to generate validation report
generate_report() {
    local validation_id="$1"
    local output_file="${2:-validation_report.html}"
    
    log_message INFO "Generating validation report..."
    
    # Get validation results
    local results=$(sqlite3 -json "$RT_DB" "SELECT * FROM validation_results WHERE validation_id='$validation_id'")
    
    cat > "$output_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Record Type Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #0070d2; color: white; padding: 20px; }
        .summary { background: #f3f3f3; padding: 15px; margin: 20px 0; }
        .issues { margin: 20px 0; }
        .issue { background: #fff; border-left: 4px solid #ff6b6b; padding: 10px; margin: 10px 0; }
        .success { color: #4caf50; }
        .error { color: #f44336; }
        .warning { color: #ff9800; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Record Type Validation Report</h1>
    </div>
EOF
    
    echo "$results" | jq -r '.[0] | 
        "<div class=\"summary\">
            <h2>Summary</h2>
            <p>File: \(.csv_file)</p>
            <p>Object: \(.object_name)</p>
            <p>Total Records: \(.total_records)</p>
            <p class=\"success\">Valid Records: \(.valid_records)</p>
            <p class=\"error\">Invalid Records: \(.invalid_records)</p>
            <p>Validation Date: \(.created_at)</p>
        </div>"' >> "$output_file"
    
    # Add issues if any
    local issues=$(echo "$results" | jq -r '.[0].issues')
    if [[ "$issues" != "[]" ]]; then
        echo '<div class="issues"><h2>Issues Found</h2>' >> "$output_file"
        echo "$issues" | jq -r '.[] | "<div class=\"issue\">Row \(.row): \(.issues)</div>"' >> "$output_file"
        echo '</div>' >> "$output_file"
    fi
    
    echo '</body></html>' >> "$output_file"
    
    log_message SUCCESS "Report generated: $output_file"
}

# Main execution
main() {
    # Initialize database if needed
    [[ ! -f "$RT_DB" ]] && init_database
    
    # Parse command
    local command="${1:-}"
    shift || true
    
    # Parse options
    local object=""
    local org_alias=""
    local csv_file=""
    local rt_id=""
    local rt_column="RecordTypeId"
    local verbose=false
    
    while getopts "o:a:f:r:c:vh" opt; do
        case $opt in
            o) object="$OPTARG";;
            a) org_alias="$OPTARG";;
            f) csv_file="$OPTARG";;
            r) rt_id="$OPTARG";;
            c) rt_column="$OPTARG";;
            v) verbose=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    # Execute command
    case "$command" in
        fetch)
            [[ -z "$object" ]] || [[ -z "$org_alias" ]] && usage
            fetch_record_types "$object" "$org_alias"
            ;;
        validate)
            [[ -z "$csv_file" ]] || [[ -z "$object" ]] || [[ -z "$org_alias" ]] && usage
            validate_csv "$csv_file" "$object" "$org_alias" "$rt_column"
            ;;
        analyze)
            [[ -z "$object" ]] || [[ -z "$org_alias" ]] && usage
            analyze_picklist_compatibility "$object" "$org_alias"
            ;;
        split)
            [[ -z "$csv_file" ]] || [[ -z "$object" ]] || [[ -z "$org_alias" ]] && usage
            split_csv "$csv_file" "$object" "$org_alias"
            ;;
        fix)
            log_message INFO "Fix command not yet implemented"
            ;;
        report)
            [[ -z "$csv_file" ]] && usage
            generate_report "$csv_file"
            ;;
        cache)
            echo "Cache location: $CACHE_DIR"
            echo "Database size: $(du -h "$RT_DB" | cut -f1)"
            echo "Cached objects: $(sqlite3 "$RT_DB" "SELECT COUNT(DISTINCT object_name) FROM record_types")"
            ;;
        *)
            usage
            ;;
    esac
}

# Run main function
main "$@"