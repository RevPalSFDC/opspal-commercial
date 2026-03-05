#!/bin/bash

##############################################################################
# error-prevention-guard.sh - Pre-emptive Error Prevention System
##############################################################################
# Intercepts Salesforce operations before execution to prevent known errors
# Applies preventive fixes based on historical patterns and best practices
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_FIX_ENGINE="${SCRIPT_DIR}/auto-fix-engine.py"
PATTERNS_FILE="${SCRIPT_DIR}/../templates/auto-fix-patterns.json"
PREVENTION_LOG="${SCRIPT_DIR}/prevention.log"
PREVENTION_CACHE="${SCRIPT_DIR}/.prevention_cache"

# Prevention modes
PREVENTION_MODE="${PREVENTION_MODE:-balanced}"  # aggressive, balanced, conservative
AUTO_APPLY="${AUTO_APPLY:-true}"
VERBOSE="${VERBOSE:-false}"

##############################################################################
# Logging Functions
##############################################################################

log_prevention() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" >> "$PREVENTION_LOG"
    
    if [[ "$VERBOSE" == "true" ]] || [[ "$level" == "ERROR" ]] || [[ "$level" == "WARNING" ]]; then
        case "$level" in
            ERROR)
                echo -e "${RED}[PREVENTION ERROR]${NC} $message" >&2
                ;;
            WARNING)
                echo -e "${YELLOW}[PREVENTION WARNING]${NC} $message"
                ;;
            SUCCESS)
                echo -e "${GREEN}[PREVENTION SUCCESS]${NC} $message"
                ;;
            INFO)
                echo -e "${BLUE}[PREVENTION]${NC} $message"
                ;;
            FIXED)
                echo -e "${CYAN}[AUTO-FIXED]${NC} $message"
                ;;
        esac
    fi
}

##############################################################################
# Prevention Checks
##############################################################################

check_csv_file() {
    local file="$1"
    local issues_found=0
    local fixes_applied=()
    
    if [[ ! -f "$file" ]]; then
        log_prevention "ERROR" "File not found: $file"
        return 1
    fi
    
    log_prevention "INFO" "Checking CSV file: $file"
    
    # Check 1: Line endings
    local line_ending=$(file "$file" | grep -o "CRLF\|CR\|LF" | head -1)
    if [[ -z "$line_ending" ]]; then
        # Try another method
        if xxd -l 100 "$file" | grep -q "0d0a"; then
            line_ending="CRLF"
        elif xxd -l 100 "$file" | grep -q "0a"; then
            line_ending="LF"
        fi
    fi
    
    # Salesforce bulk API prefers CRLF for Windows compatibility
    if [[ "$line_ending" != "CRLF" ]]; then
        log_prevention "WARNING" "File has $line_ending line endings, converting to CRLF"
        
        if [[ "$AUTO_APPLY" == "true" ]]; then
            # Create backup
            cp "$file" "${file}.backup.$(date +%s)"
            
            # Convert to CRLF
            if command -v unix2dos &> /dev/null; then
                unix2dos "$file" 2>/dev/null
            else
                # Fallback method
                sed -i 's/$/\r/' "$file"
            fi
            
            log_prevention "FIXED" "Converted line endings to CRLF"
            fixes_applied+=("line_endings")
        else
            ((issues_found++))
        fi
    fi
    
    # Check 2: BOM (Byte Order Mark)
    if head -c 3 "$file" | grep -q $'\xef\xbb\xbf'; then
        log_prevention "WARNING" "File has BOM, removing"
        
        if [[ "$AUTO_APPLY" == "true" ]]; then
            # Remove BOM
            sed -i '1s/^\xEF\xBB\xBF//' "$file"
            log_prevention "FIXED" "Removed BOM from file"
            fixes_applied+=("bom_removed")
        else
            ((issues_found++))
        fi
    fi
    
    # Check 3: Empty lines
    if tail -n 1 "$file" | wc -c | grep -q "^0$"; then
        log_prevention "WARNING" "File ends with empty line"
        
        if [[ "$AUTO_APPLY" == "true" ]]; then
            # Remove trailing empty lines
            sed -i -e :a -e '/^\s*$/d;N;ba' "$file"
            log_prevention "FIXED" "Removed trailing empty lines"
            fixes_applied+=("empty_lines")
        else
            ((issues_found++))
        fi
    fi
    
    # Check 4: Field names
    local header=$(head -n 1 "$file")
    if echo "$header" | grep -q '[^a-zA-Z0-9_,"]'; then
        log_prevention "WARNING" "Header contains special characters"
        
        if [[ "$AUTO_APPLY" == "true" ]]; then
            # Clean header
            local cleaned_header=$(echo "$header" | sed 's/[^a-zA-Z0-9_,"]/_/g')
            sed -i "1s/.*/$cleaned_header/" "$file"
            log_prevention "FIXED" "Cleaned header field names"
            fixes_applied+=("field_names")
        else
            ((issues_found++))
        fi
    fi
    
    # Check 5: File size for chunking
    local line_count=$(wc -l < "$file")
    if [[ $line_count -gt 10000 ]]; then
        log_prevention "WARNING" "Large file detected ($line_count lines), consider chunking"
        
        if [[ "$PREVENTION_MODE" == "aggressive" ]] && [[ "$AUTO_APPLY" == "true" ]]; then
            # Auto-split large files
            split_csv_file "$file" 5000
            log_prevention "FIXED" "Split file into chunks"
            fixes_applied+=("chunked")
        else
            ((issues_found++))
        fi
    fi
    
    # Report results
    if [[ ${#fixes_applied[@]} -gt 0 ]]; then
        log_prevention "SUCCESS" "Applied ${#fixes_applied[@]} preventive fixes: ${fixes_applied[*]}"
        return 0
    elif [[ $issues_found -gt 0 ]]; then
        log_prevention "WARNING" "Found $issues_found issues, auto-apply disabled"
        return 1
    else
        log_prevention "INFO" "File passes all checks"
        return 0
    fi
}

check_soql_query() {
    local query="$1"
    local issues_found=0
    local fixes_applied=()
    
    log_prevention "INFO" "Checking SOQL query"
    
    # Check 1: Missing SELECT
    if ! echo "$query" | grep -qi "^SELECT"; then
        log_prevention "WARNING" "Query doesn't start with SELECT"
        ((issues_found++))
    fi
    
    # Check 2: Relationship queries without proper notation
    if echo "$query" | grep -q "\." && ! echo "$query" | grep -q "__r\."; then
        log_prevention "WARNING" "Possible incorrect relationship notation"
        
        if [[ "$AUTO_APPLY" == "true" ]]; then
            # Try to fix common relationship issues
            query=$(echo "$query" | sed 's/\([A-Z][a-zA-Z]*\)\./\1__r./g')
            log_prevention "FIXED" "Adjusted relationship notation"
            fixes_applied+=("relationship_notation")
        else
            ((issues_found++))
        fi
    fi
    
    # Check 3: Reserved keywords without escaping
    local reserved_words="GROUP ORDER BY WHERE LIMIT OFFSET"
    for word in $reserved_words; do
        if echo "$query" | grep -q " ${word,,} "; then
            log_prevention "WARNING" "Lowercase reserved keyword: ${word,,}"
            
            if [[ "$AUTO_APPLY" == "true" ]]; then
                query=$(echo "$query" | sed "s/ ${word,,} / $word /g")
                log_prevention "FIXED" "Capitalized reserved keyword: $word"
                fixes_applied+=("reserved_keywords")
            else
                ((issues_found++))
            fi
        fi
    done
    
    # Check 4: CustomField tooling nuances
    if echo "$query" | grep -qi "FROM[[:space:]]\+CustomField"; then
        if echo "$query" | grep -q "MasterLabel"; then
            log_prevention "WARNING" "CustomField does not expose MasterLabel; using Label instead"

            if [[ "$AUTO_APPLY" == "true" ]]; then
                # Replace bare MasterLabel tokens with Label while preserving other casing
                query=$(python3 - "$query" <<'PY'
import re
import sys

original = sys.argv[1]

def replace_master_label(sql: str) -> str:
    # Replace MasterLabel tokens that are not already part of qualified names (e.g., Metadata.MasterLabel)
    pattern = re.compile(r'(?<![\.\w])MasterLabel(?![\w\.])')
    return pattern.sub('Label', sql)

print(replace_master_label(original))
PY
)
                log_prevention "FIXED" "Replaced MasterLabel with Label for CustomField queries"
                fixes_applied+=("customfield_masterlabel")
            else
                ((issues_found++))
            fi
        fi
    fi

    # Return fixed query or original
    if [[ ${#fixes_applied[@]} -gt 0 ]]; then
        echo "$query"
        return 0
    elif [[ $issues_found -gt 0 ]]; then
        return 1
    else
        return 0
    fi
}

check_bulk_operation() {
    local operation="$1"
    local object="$2"
    local file="$3"
    
    log_prevention "INFO" "Checking bulk operation: $operation on $object"
    
    # Check file if provided
    if [[ -n "$file" ]] && [[ -f "$file" ]]; then
        check_csv_file "$file"
    fi
    
    # Check operation-specific issues
    case "$operation" in
        upsert)
            # Check for external ID field
            if ! echo "$@" | grep -q -- "--external-id\|--externalid\|-i"; then
                log_prevention "WARNING" "Upsert without external ID specified, defaulting to Id"
            fi
            ;;
        delete)
            # Warn about delete operations
            log_prevention "WARNING" "Delete operation detected - ensure data is backed up"
            ;;
    esac
    
    return 0
}

##############################################################################
# Prevention Actions
##############################################################################

split_csv_file() {
    local file="$1"
    local chunk_size="${2:-5000}"
    
    local header=$(head -n 1 "$file")
    local base_name="${file%.csv}"
    local chunk_num=0
    
    # Split file keeping header
    tail -n +2 "$file" | split -l $chunk_size - "${base_name}_chunk_"
    
    # Add header to each chunk
    for chunk in ${base_name}_chunk_*; do
        local new_name="${base_name}_chunk_${chunk_num}.csv"
        echo "$header" > "$new_name"
        cat "$chunk" >> "$new_name"
        rm "$chunk"
        ((chunk_num++))
    done
    
    log_prevention "INFO" "Split $file into $chunk_num chunks of $chunk_size lines"
}

validate_connection() {
    local org_alias="${1:-$SF_TARGET_ORG}"
    
    if [[ -z "$org_alias" ]]; then
        log_prevention "WARNING" "No org alias specified"
        return 1
    fi
    
    # Check if authenticated
    if ! sf org display -u "$org_alias" &> /dev/null; then
        log_prevention "ERROR" "Not authenticated to org: $org_alias"
        
        if [[ "$AUTO_APPLY" == "true" ]]; then
            log_prevention "INFO" "Attempting to refresh authentication"
            sf org login web --setalias "$org_alias" || return 1
            log_prevention "FIXED" "Re-authenticated to org"
        else
            return 1
        fi
    fi
    
    return 0
}

##############################################################################
# Main Prevention Function
##############################################################################

prevent_errors() {
    local command="$1"
    shift
    local args="$@"
    
    log_prevention "INFO" "=== Prevention Guard Activated ==="
    log_prevention "INFO" "Command: $command"
    log_prevention "INFO" "Args: $args"
    log_prevention "INFO" "Mode: $PREVENTION_MODE"
    
    local prevention_applied=false
    local should_proceed=true
    
    # Identify command type and apply preventive measures
    case "$command" in
        *"data"*"upsert"*|*"data"*"insert"*|*"data"*"update"*|*"data"*"delete"*)
            # Bulk data operation
            local file=""
            local object=""
            local operation=""
            
            # Parse arguments
            for arg in $args; do
                if [[ -f "$arg" ]]; then
                    file="$arg"
                elif [[ "$arg" =~ ^[A-Z][a-zA-Z0-9_]*(__c)?$ ]]; then
                    object="$arg"
                elif [[ "$arg" =~ ^(insert|update|upsert|delete)$ ]]; then
                    operation="$arg"
                fi
            done
            
            if [[ -n "$file" ]]; then
                check_csv_file "$file"
                prevention_applied=true
            fi
            
            if [[ -n "$operation" ]] && [[ -n "$object" ]]; then
                check_bulk_operation "$operation" "$object" "$file"
                prevention_applied=true
            fi
            ;;
            
        *"query"*)
            # SOQL query operation
            local query=$(echo "$args" | grep -oP "(?<=--query )['\"].*?['\"]|(?<=--query ).*?(?= --|\$)")
            if [[ -n "$query" ]]; then
                local fixed_query=$(check_soql_query "$query")
                if [[ $? -eq 0 ]]; then
                    if [[ "$fixed_query" != "$query" ]]; then
                        # Replace query in args safely
                        args=$(python3 -c "import sys\noriginal=sys.argv[1]\nold=sys.argv[2]\nnew=sys.argv[3]\nprint(original.replace(old, new, 1))" "$args" "$query" "$fixed_query")
                        query="$fixed_query"
                        prevention_applied=true
                    else
                        query="$fixed_query"
                    fi
                fi

                # Auto-append Tooling API flag for metadata objects
                if echo "$query" | grep -qi "FROM[[:space:]]\+CustomField"; then
                    if ! echo " $args " | grep -q " --use-tooling-api " && ! echo " $args " | grep -q " -t "; then
                        log_prevention "INFO" "Adding --use-tooling-api for CustomField query"
                        args+=" --use-tooling-api"
                        prevention_applied=true
                    fi
                fi
            fi
            ;;
            
        *"deploy"*|*"retrieve"*)
            # Metadata operation
            log_prevention "INFO" "Metadata operation detected"
            validate_connection
            ;;
            
        *)
            log_prevention "INFO" "No specific prevention rules for this command"
            ;;
    esac
    
    # Check if we should proceed
    if [[ "$should_proceed" == "false" ]]; then
        log_prevention "ERROR" "Prevention check failed, aborting operation"
        return 1
    fi
    
    if [[ "$prevention_applied" == "true" ]]; then
        log_prevention "SUCCESS" "Prevention measures applied"
    fi
    
    # Execute the command (or return the modified command)
    if [[ "${EXECUTE_COMMAND:-true}" == "true" ]]; then
        log_prevention "INFO" "Executing command with prevention measures"
        $command $args
    else
        # Return modified command for execution elsewhere
        echo "$command $args"
    fi
}

##############################################################################
# Usage Functions
##############################################################################

show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] COMMAND [ARGS...]

Pre-emptive error prevention for Salesforce operations.

OPTIONS:
    -m MODE     Prevention mode: aggressive, balanced, conservative (default: balanced)
    -a          Auto-apply fixes (default: true)
    -n          No auto-apply (dry run)
    -v          Verbose output
    -h          Show this help

MODES:
    aggressive   - Apply all preventive fixes automatically
    balanced     - Apply safe fixes automatically, warn about others
    conservative - Only warn, don't apply fixes

EXAMPLES:
    # Check and fix CSV before import
    $0 sf data upsert bulk --sobject Account --file accounts.csv
    
    # Check SOQL query
    $0 sf data query --query "SELECT Id, Name FROM Account"
    
    # Dry run mode
    $0 -n sf data import --file contacts.csv
    
    # Aggressive mode with verbose output
    $0 -m aggressive -v sf deploy metadata

EOF
    exit 0
}

##############################################################################
# Main Execution
##############################################################################

main() {
    # Parse options
    while getopts "m:anvh" opt; do
        case $opt in
            m)
                PREVENTION_MODE="$OPTARG"
                ;;
            a)
                AUTO_APPLY="true"
                ;;
            n)
                AUTO_APPLY="false"
                ;;
            v)
                VERBOSE="true"
                ;;
            h)
                show_usage
                ;;
            *)
                show_usage
                ;;
        esac
    done
    
    shift $((OPTIND-1))
    
    if [[ $# -eq 0 ]]; then
        show_usage
    fi
    
    # Create prevention cache directory
    mkdir -p "$PREVENTION_CACHE"
    
    # Apply prevention
    prevent_errors "$@"
}

# Allow sourcing for use in other scripts
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
