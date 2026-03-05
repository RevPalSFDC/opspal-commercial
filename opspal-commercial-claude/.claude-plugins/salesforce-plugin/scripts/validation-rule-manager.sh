#!/bin/bash

##############################################################################
# validation-rule-manager.sh - Validation Rule Cache & Analysis Manager
##############################################################################
# Manages validation rules from Salesforce orgs, provides analysis,
# and maintains an intelligent cache for quick lookups
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
CACHE_DIR="${SCRIPT_DIR}/../.validation-cache"
RULES_DB="${CACHE_DIR}/validation_rules.db"
PATTERNS_FILE="${CACHE_DIR}/known_patterns.json"
LOG_FILE="${CACHE_DIR}/manager.log"

# Create directories
mkdir -p "$CACHE_DIR"

# Initialize SQLite database for rule storage
init_database() {
    sqlite3 "$RULES_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS validation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias TEXT NOT NULL,
    object_name TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    description TEXT,
    error_formula TEXT,
    error_message TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_alias, object_name, rule_name)
);

CREATE TABLE IF NOT EXISTS field_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias TEXT NOT NULL,
    object_name TEXT NOT NULL,
    field_name TEXT NOT NULL,
    is_required BOOLEAN NOT NULL,
    data_type TEXT,
    default_value TEXT,
    picklist_values TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_alias, object_name, field_name)
);

CREATE TABLE IF NOT EXISTS known_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    solution TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pattern)
);

CREATE INDEX IF NOT EXISTS idx_rules_org_object ON validation_rules(org_alias, object_name);
CREATE INDEX IF NOT EXISTS idx_fields_org_object ON field_requirements(org_alias, object_name);
CREATE INDEX IF NOT EXISTS idx_issues_frequency ON known_issues(frequency DESC);
EOF
    
    echo -e "${GREEN}Database initialized${NC}"
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    fetch       Fetch validation rules from Salesforce org
    analyze     Analyze validation rules for an object
    list        List cached validation rules
    clear       Clear cache for specific org/object
    patterns    Show known issue patterns
    suggest     Suggest fixes for common issues
    export      Export rules to JSON/CSV
    monitor     Monitor validation rule changes

Options:
    -o OBJECT       Salesforce object name
    -a ALIAS        Org alias
    -f FORMAT       Export format (json|csv)
    -r              Force refresh from org
    -v              Verbose output
    -h              Display this help

Examples:
    # Fetch all validation rules for Account
    $0 fetch -o Account -a myorg

    # Analyze rules and suggest data fixes
    $0 analyze -o Contact -a myorg

    # List all cached rules
    $0 list

    # Export rules to JSON
    $0 export -a myorg -f json

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

# Function to fetch validation rules from Salesforce
fetch_validation_rules() {
    local object="$1"
    local org_alias="$2"
    local force_refresh="${3:-false}"
    
    log_message INFO "Fetching validation rules for $object from $org_alias..."
    
    # Check if we need to refresh
    if [[ "$force_refresh" != "true" ]]; then
        local last_update=$(sqlite3 "$RULES_DB" "SELECT MAX(last_updated) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object'")
        if [[ -n "$last_update" ]]; then
            local hours_old=$(( ($(date +%s) - $(date -d "$last_update" +%s)) / 3600 ))
            if [[ $hours_old -lt 24 ]]; then
                log_message INFO "Using cached rules (${hours_old}h old). Use -r to force refresh."
                return 0
            fi
        fi
    fi
    
    # Query validation rules using Tooling API (without formula field which requires individual queries)
    local query="SELECT Id, ValidationName, Active, Description, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${object}'"
    
    local cmd="sf data query --query \"$query\" --use-tooling-api --json"
    [[ -n "$org_alias" ]] && cmd="$cmd --target-org $org_alias"
    
    local response=$($cmd 2>/dev/null)
    
    if [[ $? -ne 0 ]]; then
        log_message ERROR "Failed to fetch validation rules"
        return 1
    fi
    
    # Parse and store rules
    echo "$response" | jq -r '.result.records[] | @json' | while read -r rule; do
        local rule_id=$(echo "$rule" | jq -r '.Id')
        local rule_name=$(echo "$rule" | jq -r '.ValidationName')
        local active=$(echo "$rule" | jq -r '.Active')
        local description=$(echo "$rule" | jq -r '.Description // ""')
        local message=$(echo "$rule" | jq -r '.ErrorMessage // ""')
        
        # Try to get formula via individual query (Metadata field requires single-record query)
        local formula=""
        formula=$(get_validation_rule_formula "$rule_id" "$org_alias" 2>/dev/null) || formula=""
        
        # Insert or update in database
        sqlite3 "$RULES_DB" << EOF
INSERT OR REPLACE INTO validation_rules 
(org_alias, object_name, rule_name, active, description, error_formula, error_message, last_updated)
VALUES ('$org_alias', '$object', '$rule_name', $active, '$description', '$formula', '$message', CURRENT_TIMESTAMP);
EOF
    done
    
    # Fetch field requirements
    fetch_field_requirements "$object" "$org_alias"
    
    log_message SUCCESS "Validation rules cached successfully"
}

# Function to get validation rule formula (requires individual query)
get_validation_rule_formula() {
    local rule_id="$1"
    local org_alias="$2"
    
    # Query individual rule for Metadata field (includes formula)
    local query="SELECT Id, Metadata FROM ValidationRule WHERE Id='${rule_id}'"
    local cmd="sf data query --query \"$query\" --use-tooling-api --json"
    [[ -n "$org_alias" ]] && cmd="$cmd --target-org $org_alias"
    
    local response=$($cmd 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        # Extract ErrorConditionFormula from Metadata
        echo "$response" | jq -r '.result.records[0].Metadata.errorConditionFormula // ""'
    else
        # Fallback: try metadata retrieve if query fails
        retrieve_validation_rule_metadata "$rule_id" "$org_alias"
    fi
}

# Function to retrieve validation rule metadata using sf retrieve
retrieve_validation_rule_metadata() {
    local rule_id="$1"
    local org_alias="$2"
    local temp_dir="$(mktemp -d)"
    
    # Create package.xml for specific validation rule
    cat > "$temp_dir/package.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ValidationRule</name>
    </types>
    <version>62.0</version>
</Package>
EOF
    
    # Retrieve metadata
    sf project retrieve start --manifest "$temp_dir/package.xml" --target-org "$org_alias" --output-dir "$temp_dir" 2>/dev/null
    
    # Find and parse the validation rule file
    local rule_file=$(find "$temp_dir" -name "*.validationRule-meta.xml" -print -quit)
    if [[ -f "$rule_file" ]]; then
        # Extract errorConditionFormula from XML
        grep -oP '(?<=<errorConditionFormula>).*(?=</errorConditionFormula>)' "$rule_file" | head -1
    fi
    
    # Cleanup
    rm -rf "$temp_dir"
}

# Function to fetch field requirements
fetch_field_requirements() {
    local object="$1"
    local org_alias="$2"
    
    log_message INFO "Fetching field requirements for $object..."
    
    # Query required fields
    local query="SELECT QualifiedApiName, IsNillable, DefaultValue, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsNillable = false"
    
    local cmd="sf data query --query \"$query\" --use-tooling-api --json"
    [[ -n "$org_alias" ]] && cmd="$cmd --target-org $org_alias"
    
    local response=$($cmd 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        echo "$response" | jq -r '.result.records[] | @json' | while read -r field; do
            local field_name=$(echo "$field" | jq -r '.QualifiedApiName')
            local data_type=$(echo "$field" | jq -r '.DataType')
            local default_value=$(echo "$field" | jq -r '.DefaultValue // ""')
            
            sqlite3 "$RULES_DB" << EOF
INSERT OR REPLACE INTO field_requirements 
(org_alias, object_name, field_name, is_required, data_type, default_value, last_updated)
VALUES ('$org_alias', '$object', '$field_name', 1, '$data_type', '$default_value', CURRENT_TIMESTAMP);
EOF
        done
        
        log_message SUCCESS "Field requirements cached"
    else
        log_message WARNING "Could not fetch field requirements"
    fi
}

# Function to analyze validation rules
analyze_validation_rules() {
    local object="$1"
    local org_alias="$2"
    
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     Validation Rule Analysis Report      ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    
    # Get active validation rules
    local active_rules=$(sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object' AND active=1")
    local total_rules=$(sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object'")
    
    echo -e "${BLUE}Object:${NC} $object"
    echo -e "${BLUE}Org:${NC} $org_alias"
    echo -e "${BLUE}Active Rules:${NC} $active_rules / $total_rules"
    echo ""
    
    # Check for record type restrictions (NEW)
    check_record_type_restrictions "$object" "$org_alias"
    echo ""
    
    # List active rules with analysis
    echo -e "${YELLOW}Active Validation Rules:${NC}"
    sqlite3 -separator "|" "$RULES_DB" << EOF | while IFS='|' read -r name description formula message; do
SELECT rule_name, description, error_formula, error_message 
FROM validation_rules 
WHERE org_alias='$org_alias' AND object_name='$object' AND active=1;
EOF
        echo ""
        echo -e "${GREEN}► $name${NC}"
        [[ -n "$description" ]] && echo "  Description: $description"
        echo "  Error: $message"
        
        # Analyze formula for common patterns
        if echo "$formula" | grep -q "ISBLANK"; then
            echo -e "  ${YELLOW}⚠ Requires field to be populated${NC}"
        fi
        if echo "$formula" | grep -q "ISPICKVAL"; then
            echo -e "  ${YELLOW}⚠ Validates picklist values${NC}"
        fi
        if echo "$formula" | grep -q "AND\|OR"; then
            echo -e "  ${YELLOW}⚠ Complex multi-condition rule${NC}"
        fi
    done
    
    echo ""
    echo -e "${YELLOW}Required Fields:${NC}"
    sqlite3 -column "$RULES_DB" << EOF
SELECT field_name, data_type, default_value 
FROM field_requirements 
WHERE org_alias='$org_alias' AND object_name='$object' AND is_required=1
LIMIT 10;
EOF
    
    # Suggest common fixes
    echo ""
    echo -e "${CYAN}Recommended Data Preparations:${NC}"
    suggest_fixes "$object" "$org_alias"
}

# Function to suggest fixes based on patterns
suggest_fixes() {
    local object="$1"
    local org_alias="$2"
    
    # Check for common patterns and suggest fixes
    local suggestions=()
    
    # Check for Website requirement on Account
    if [[ "$object" == "Account" ]]; then
        if sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='Account' AND error_formula LIKE '%Website%'" | grep -q "^[1-9]"; then
            suggestions+=("Add default Website value: 'N/A' or 'https://example.com'")
        fi
    fi
    
    # Check for email validation
    if sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object' AND error_formula LIKE '%Email%'" | grep -q "^[1-9]"; then
        suggestions+=("Validate email format: user@domain.com")
    fi
    
    # Check for phone validation
    if sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object' AND error_formula LIKE '%Phone%'" | grep -q "^[1-9]"; then
        suggestions+=("Standardize phone format: (xxx) xxx-xxxx")
    fi
    
    # Check for date validations
    if sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object' AND error_formula LIKE '%Date%'" | grep -q "^[1-9]"; then
        suggestions+=("Ensure date format: YYYY-MM-DD")
        suggestions+=("Check for future/past date restrictions")
    fi
    
    # Display suggestions
    if [[ ${#suggestions[@]} -gt 0 ]]; then
        for suggestion in "${suggestions[@]}"; do
            echo "  • $suggestion"
        done
    else
        echo "  No specific preparations required"
    fi
    
    # Record patterns in known_issues
    for suggestion in "${suggestions[@]}"; do
        sqlite3 "$RULES_DB" << EOF
INSERT OR REPLACE INTO known_issues (pattern, solution, frequency, last_seen)
VALUES ('$object validation', '$suggestion', 
    COALESCE((SELECT frequency + 1 FROM known_issues WHERE pattern='$object validation' AND solution='$suggestion'), 1),
    CURRENT_TIMESTAMP);
EOF
    done
}

# Function to list all cached rules
list_cached_rules() {
    echo -e "${CYAN}Cached Validation Rules:${NC}"
    echo ""
    
    sqlite3 -column -header "$RULES_DB" << EOF
SELECT org_alias, object_name, COUNT(*) as rule_count, 
       SUM(active) as active_count,
       MAX(last_updated) as last_updated
FROM validation_rules
GROUP BY org_alias, object_name
ORDER BY org_alias, object_name;
EOF
}

# Function to export rules
export_rules() {
    local org_alias="$1"
    local format="$2"
    local output_file="${CACHE_DIR}/validation_rules_export.${format}"
    
    if [[ "$format" == "json" ]]; then
        sqlite3 "$RULES_DB" << EOF | jq -s '.' > "$output_file"
SELECT json_object(
    'org_alias', org_alias,
    'object_name', object_name,
    'rule_name', rule_name,
    'active', active,
    'description', description,
    'error_formula', error_formula,
    'error_message', error_message
)
FROM validation_rules
WHERE org_alias='$org_alias';
EOF
    elif [[ "$format" == "csv" ]]; then
        sqlite3 -csv -header "$RULES_DB" << EOF > "$output_file"
SELECT org_alias, object_name, rule_name, active, description, error_message
FROM validation_rules
WHERE org_alias='$org_alias';
EOF
    fi
    
    log_message SUCCESS "Rules exported to $output_file"
}

# Function to show known patterns
show_patterns() {
    echo -e "${CYAN}Known Issue Patterns:${NC}"
    echo ""
    
    sqlite3 -column -header "$RULES_DB" << EOF
SELECT pattern, solution, frequency, last_seen
FROM known_issues
ORDER BY frequency DESC
LIMIT 20;
EOF
}

# Function to monitor changes
monitor_changes() {
    local org_alias="$1"
    
    echo -e "${CYAN}Monitoring validation rule changes...${NC}"
    echo "Press Ctrl+C to stop"
    echo ""
    
    while true; do
        # Get current state
        local current_hash=$(sqlite3 "$RULES_DB" "SELECT GROUP_CONCAT(rule_name || active) FROM validation_rules WHERE org_alias='$org_alias'" | md5sum)
        
        # Wait and check again
        sleep 300  # Check every 5 minutes
        
        # Fetch latest rules
        for object in Account Contact Opportunity Lead Case; do
            fetch_validation_rules "$object" "$org_alias" true > /dev/null 2>&1
        done
        
        # Get new state
        local new_hash=$(sqlite3 "$RULES_DB" "SELECT GROUP_CONCAT(rule_name || active) FROM validation_rules WHERE org_alias='$org_alias'" | md5sum)
        
        if [[ "$current_hash" != "$new_hash" ]]; then
            echo -e "${YELLOW}[$(date '+%H:%M:%S')] Changes detected in validation rules!${NC}"
            
            # Show what changed
            sqlite3 "$RULES_DB" << EOF
SELECT object_name, rule_name, 
       CASE WHEN active=1 THEN 'Active' ELSE 'Inactive' END as status
FROM validation_rules 
WHERE org_alias='$org_alias' 
  AND last_updated > datetime('now', '-5 minutes');
EOF
        else
            echo -e "${GREEN}[$(date '+%H:%M:%S')] No changes detected${NC}"
        fi
    done
}

# Function to check record type restrictions (NEW)
check_record_type_restrictions() {
    local object="$1"
    local org_alias="$2"
    
    echo -e "${YELLOW}Record Type Picklist Restrictions:${NC}"
    
    # Source record type commons if available
    if [[ -f "${SCRIPT_DIR}/lib/record-type-commons.sh" ]]; then
        source "${SCRIPT_DIR}/lib/record-type-commons.sh"
        
        # Get record types
        local rt_count=$(get_record_types "$object" "$org_alias" | grep "|true$" | wc -l)
        
        if [[ $rt_count -gt 0 ]]; then
            echo -e "  ${BLUE}Active Record Types:${NC} $rt_count"
            
            # Check for picklist fields
            local picklist_query="SELECT COUNT(*) FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}' AND DataType IN ('Picklist', 'MultiselectPicklist')"
            local picklist_count=$(sf data query --query "$picklist_query" --use-tooling-api --json --target-org "$org_alias" 2>/dev/null | jq -r '.result.records[0].expr0')
            
            if [[ $picklist_count -gt 0 ]]; then
                echo -e "  ${YELLOW}⚠ $picklist_count picklist fields may have record type restrictions${NC}"
                echo -e "  ${CYAN}Recommendation:${NC} Run record-type-picklist-validator.sh for detailed analysis"
            fi
        else
            echo -e "  ${GREEN}No record types configured - no picklist restrictions${NC}"
        fi
    else
        echo -e "  ${YELLOW}Record type validator not available${NC}"
    fi
}

# Main execution
main() {
    # Initialize database if needed
    [[ ! -f "$RULES_DB" ]] && init_database
    
    # Parse command
    local command="${1:-}"
    shift || true
    
    # Parse options
    local object=""
    local org_alias=""
    local format="json"
    local refresh=false
    local verbose=false
    
    while getopts "o:a:f:rvh" opt; do
        case $opt in
            o) object="$OPTARG";;
            a) org_alias="$OPTARG";;
            f) format="$OPTARG";;
            r) refresh=true;;
            v) verbose=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    # Execute command
    case "$command" in
        fetch)
            [[ -z "$object" ]] || [[ -z "$org_alias" ]] && usage
            fetch_validation_rules "$object" "$org_alias" "$refresh"
            ;;
        analyze)
            [[ -z "$object" ]] || [[ -z "$org_alias" ]] && usage
            # Fetch first if needed
            fetch_validation_rules "$object" "$org_alias" false
            analyze_validation_rules "$object" "$org_alias"
            ;;
        list)
            list_cached_rules
            ;;
        clear)
            if [[ -n "$org_alias" ]] && [[ -n "$object" ]]; then
                sqlite3 "$RULES_DB" "DELETE FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object'"
                log_message SUCCESS "Cache cleared for $object in $org_alias"
            else
                log_message ERROR "Specify both -a and -o to clear cache"
            fi
            ;;
        patterns)
            show_patterns
            ;;
        suggest)
            [[ -z "$object" ]] || [[ -z "$org_alias" ]] && usage
            suggest_fixes "$object" "$org_alias"
            ;;
        export)
            [[ -z "$org_alias" ]] && usage
            export_rules "$org_alias" "$format"
            ;;
        monitor)
            [[ -z "$org_alias" ]] && usage
            monitor_changes "$org_alias"
            ;;
        *)
            usage
            ;;
    esac
}

# Run main function
main "$@"