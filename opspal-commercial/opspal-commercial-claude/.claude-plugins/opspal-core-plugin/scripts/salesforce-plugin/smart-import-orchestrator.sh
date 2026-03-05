#!/bin/bash

##############################################################################
# smart-import-orchestrator.sh - Intelligent Import Strategy Orchestrator
##############################################################################
# This script combines multiple approaches to handle Salesforce import issues:
# 1. Pre-validation and data preparation
# 2. Multiple import method fallbacks
# 3. Automatic error recovery
# 4. Progress tracking and reporting
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="${SCRIPT_DIR}/../logs/imports"
WORK_DIR="${SCRIPT_DIR}/../.import-work"
MAX_RETRIES=3
BATCH_SIZE=1000

# Ensure directories exist
mkdir -p "$LOG_DIR" "$WORK_DIR"

# Import methods available
declare -a IMPORT_METHODS=("bulk_api" "rest_api" "soap_api" "dataloader_cli")

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] -o OBJECT -f CSV_FILE

Intelligently orchestrates Salesforce data import using multiple strategies.

OPTIONS:
    -o OBJECT       Salesforce object API name
    -f CSV_FILE     Path to CSV file to import
    -a ALIAS        Salesforce org alias (optional)
    -s STRATEGY     Import strategy: auto, fast, safe, thorough (default: auto)
    -b BATCH        Batch size for chunking (default: 1000)
    -p PARALLEL     Number of parallel imports (default: 1)
    -v              Verbose output
    -h              Display this help message

STRATEGIES:
    auto     - Automatically selects best strategy based on data
    fast     - Prioritizes speed, may skip some validations
    safe     - Maximum validation and error recovery
    thorough - Tries all methods until success

EXAMPLES:
    # Auto-select best strategy
    $0 -o Account -f accounts.csv

    # Safe mode with small batches
    $0 -o Contact -f contacts.csv -s safe -b 500

    # Fast parallel import
    $0 -o Lead -f leads.csv -s fast -p 4

EOF
    exit 1
}

# Logging functions
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        ERROR)   echo -e "${RED}[ERROR]${NC} $message" ;;
        WARNING) echo -e "${YELLOW}[WARNING]${NC} $message" ;;
        INFO)    echo -e "${BLUE}[INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        DEBUG)   [[ $VERBOSE == true ]] && echo -e "${CYAN}[DEBUG]${NC} $message" ;;
    esac
    
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# Function to analyze CSV and determine best strategy
analyze_csv() {
    local csv_file="$1"
    
    log INFO "Analyzing CSV file..."
    
    # Get file statistics
    local line_count=$(wc -l < "$csv_file")
    local file_size=$(stat -f%z "$csv_file" 2>/dev/null || stat -c%s "$csv_file" 2>/dev/null)
    local field_count=$(head -n 1 "$csv_file" | tr ',' '\n' | wc -l)
    
    # Detect line endings
    local line_ending="LF"
    if file "$csv_file" | grep -q "CRLF"; then
        line_ending="CRLF"
    elif file "$csv_file" | grep -q "CR"; then
        line_ending="CR"
    fi
    
    # Check for special characters
    local has_special_chars=false
    if grep -q '[™®©€£¥§¶†‡•…]' "$csv_file"; then
        has_special_chars=true
    fi
    
    # Determine complexity score
    local complexity=0
    [[ $line_count -gt 10000 ]] && complexity=$((complexity + 2))
    [[ $line_count -gt 50000 ]] && complexity=$((complexity + 3))
    [[ $field_count -gt 20 ]] && complexity=$((complexity + 1))
    [[ $field_count -gt 50 ]] && complexity=$((complexity + 2))
    [[ "$line_ending" != "CRLF" ]] && complexity=$((complexity + 1))
    [[ $has_special_chars == true ]] && complexity=$((complexity + 1))
    
    log DEBUG "Analysis complete: lines=$line_count, size=$file_size, fields=$field_count, complexity=$complexity"
    
    # Return analysis as JSON-like string
    echo "{\"lines\":$line_count,\"size\":$file_size,\"fields\":$field_count,\"ending\":\"$line_ending\",\"complexity\":$complexity}"
}

# Function to pre-process CSV
preprocess_csv() {
    local csv_file="$1"
    local object="$2"
    local processed_file="${WORK_DIR}/$(basename "$csv_file").processed"
    
    log INFO "Pre-processing CSV file..."
    
    # Step 1: Run validation
    if [[ -x "${SCRIPT_DIR}/pre-import-validator.sh" ]]; then
        log DEBUG "Running pre-import validation..."
        "${SCRIPT_DIR}/pre-import-validator.sh" -o "$object" -f "$csv_file" -x y >/dev/null 2>&1
        
        if [[ -f "${csv_file}.transformed" ]]; then
            cp "${csv_file}.transformed" "$processed_file"
        else
            cp "$csv_file" "$processed_file"
        fi
    else
        cp "$csv_file" "$processed_file"
    fi
    
    # Step 2: Fix line endings (force CRLF for Salesforce)
    log DEBUG "Converting line endings to CRLF..."
    if command -v unix2dos &> /dev/null; then
        unix2dos "$processed_file" 2>/dev/null
    else
        sed -i 's/$/\r/' "$processed_file"
    fi
    
    # Step 3: Handle encoding issues
    log DEBUG "Checking encoding..."
    local encoding=$(file -b --mime-encoding "$processed_file")
    if [[ "$encoding" != "utf-8" ]] && [[ "$encoding" != "us-ascii" ]]; then
        log WARNING "Converting from $encoding to UTF-8"
        iconv -f "$encoding" -t UTF-8 "$processed_file" > "$processed_file.utf8" && mv "$processed_file.utf8" "$processed_file"
    fi
    
    log SUCCESS "Pre-processing complete"
    echo "$processed_file"
}

# Function to chunk CSV file
chunk_csv() {
    local csv_file="$1"
    local batch_size="$2"
    local chunk_dir="${WORK_DIR}/chunks"
    
    mkdir -p "$chunk_dir"
    
    log INFO "Splitting CSV into chunks of $batch_size records..."
    
    # Save header
    local header=$(head -n 1 "$csv_file")
    
    # Split file (excluding header)
    tail -n +2 "$csv_file" | split -l "$batch_size" - "${chunk_dir}/chunk_"
    
    # Add header to each chunk
    local chunk_count=0
    for chunk in "${chunk_dir}"/chunk_*; do
        echo "$header" > "${chunk}.csv"
        cat "$chunk" >> "${chunk}.csv"
        rm "$chunk"
        chunk_count=$((chunk_count + 1))
    done
    
    log SUCCESS "Created $chunk_count chunks"
    echo "$chunk_dir"
}

# Import method: Bulk API with safe-bulk-import
import_bulk_api() {
    local object="$1"
    local csv_file="$2"
    local org_alias="$3"
    
    log INFO "Attempting import using Bulk API..."
    
    local cmd="${SCRIPT_DIR}/safe-bulk-import.sh -o $object -f $csv_file -l CRLF"
    [[ -n "$org_alias" ]] && cmd="$cmd -a $org_alias"
    
    if $cmd >> "$LOG_FILE" 2>&1; then
        log SUCCESS "Bulk API import successful"
        return 0
    else
        log ERROR "Bulk API import failed"
        return 1
    fi
}

# Import method: REST API (using curl)
import_rest_api() {
    local object="$1"
    local csv_file="$2"
    local org_alias="$3"
    
    log INFO "Attempting import using REST API..."
    
    # Get access token and instance URL
    local auth_info=$(sf org display --json --target-org "$org_alias" 2>/dev/null | jq -r '"\(.result.accessToken) \(.result.instanceUrl)"')
    local access_token=$(echo "$auth_info" | cut -d' ' -f1)
    local instance_url=$(echo "$auth_info" | cut -d' ' -f2)
    
    if [[ -z "$access_token" ]] || [[ -z "$instance_url" ]]; then
        log ERROR "Failed to get authentication info"
        return 1
    fi
    
    # Convert CSV to JSON for REST API
    local json_file="${csv_file}.json"
    
    # Simple CSV to JSON conversion (basic implementation)
    python3 -c "
import csv, json, sys
data = []
with open('$csv_file', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        data.append(row)
with open('$json_file', 'w') as f:
    json.dump(data, f)
" 2>/dev/null
    
    if [[ ! -f "$json_file" ]]; then
        log ERROR "Failed to convert CSV to JSON"
        return 1
    fi
    
    # Import records one by one (or in batches)
    local success_count=0
    local fail_count=0
    
    while IFS= read -r record; do
        response=$(curl -s -X POST \
            -H "Authorization: Bearer $access_token" \
            -H "Content-Type: application/json" \
            -d "$record" \
            "${instance_url}/services/data/v59.0/sobjects/${object}/")
        
        if echo "$response" | grep -q '"success":true'; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
        fi
    done < <(jq -c '.[]' "$json_file")
    
    log INFO "REST API import: $success_count succeeded, $fail_count failed"
    
    [[ $fail_count -eq 0 ]] && return 0 || return 1
}

# Import method: Using Python simple-salesforce
import_python_api() {
    local object="$1"
    local csv_file="$2"
    local org_alias="$3"
    
    log INFO "Attempting import using Python Simple-Salesforce..."
    
    # Check if simple-salesforce is installed
    if ! python3 -c "import simple_salesforce" 2>/dev/null; then
        log WARNING "simple-salesforce not installed, skipping this method"
        return 1
    fi
    
    # Create Python script for import
    cat > "${WORK_DIR}/import.py" << 'EOF'
import csv
import sys
from simple_salesforce import Salesforce
import json
import subprocess

# Get auth info from SF CLI
result = subprocess.run(['sf', 'org', 'display', '--json'], capture_output=True, text=True)
auth_info = json.loads(result.stdout)

# Connect to Salesforce
sf = Salesforce(
    instance_url=auth_info['result']['instanceUrl'],
    session_id=auth_info['result']['accessToken']
)

# Read CSV and import
object_name = sys.argv[1]
csv_file = sys.argv[2]

with open(csv_file, 'r') as f:
    reader = csv.DictReader(f)
    records = list(reader)
    
    # Bulk create
    result = getattr(sf.bulk, object_name).insert(records)
    
    # Count successes
    success_count = sum(1 for r in result if r['success'])
    print(f"Imported {success_count}/{len(records)} records")
    
    sys.exit(0 if success_count == len(records) else 1)
EOF
    
    if python3 "${WORK_DIR}/import.py" "$object" "$csv_file" >> "$LOG_FILE" 2>&1; then
        log SUCCESS "Python API import successful"
        return 0
    else
        log ERROR "Python API import failed"
        return 1
    fi
}

# Main import orchestrator
orchestrate_import() {
    local object="$1"
    local csv_file="$2"
    local org_alias="$3"
    local strategy="$4"
    
    log INFO "Starting import orchestration with strategy: $strategy"
    
    # Analyze CSV
    local analysis=$(analyze_csv "$csv_file")
    local complexity=$(echo "$analysis" | grep -o '"complexity":[0-9]*' | cut -d: -f2)
    
    # Pre-process CSV
    local processed_file=$(preprocess_csv "$csv_file" "$object")
    
    # Determine import approach based on strategy and complexity
    local methods_to_try=()
    
    case "$strategy" in
        fast)
            methods_to_try=("bulk_api")
            ;;
        safe)
            # Chunk file for safety
            if [[ $complexity -gt 5 ]]; then
                log INFO "High complexity detected, using chunked import"
                local chunk_dir=$(chunk_csv "$processed_file" "$BATCH_SIZE")
                
                local chunk_success=0
                local chunk_total=0
                
                for chunk in "${chunk_dir}"/*.csv; do
                    chunk_total=$((chunk_total + 1))
                    log INFO "Processing chunk $chunk_total..."
                    
                    if import_bulk_api "$object" "$chunk" "$org_alias"; then
                        chunk_success=$((chunk_success + 1))
                    else
                        log WARNING "Chunk $chunk_total failed, continuing..."
                    fi
                done
                
                log INFO "Chunked import complete: $chunk_success/$chunk_total succeeded"
                [[ $chunk_success -eq $chunk_total ]] && return 0 || return 1
            else
                methods_to_try=("bulk_api" "rest_api")
            fi
            ;;
        thorough)
            methods_to_try=("bulk_api" "rest_api" "python_api")
            ;;
        auto|*)
            # Auto-select based on complexity
            if [[ $complexity -le 3 ]]; then
                methods_to_try=("bulk_api")
            elif [[ $complexity -le 6 ]]; then
                methods_to_try=("bulk_api" "rest_api")
            else
                methods_to_try=("bulk_api" "rest_api" "python_api")
            fi
            ;;
    esac
    
    # Try each method
    for method in "${methods_to_try[@]}"; do
        log INFO "Trying import method: $method"
        
        case "$method" in
            bulk_api)
                import_bulk_api "$object" "$processed_file" "$org_alias" && return 0
                ;;
            rest_api)
                import_rest_api "$object" "$processed_file" "$org_alias" && return 0
                ;;
            python_api)
                import_python_api "$object" "$processed_file" "$org_alias" && return 0
                ;;
        esac
        
        log WARNING "Method $method failed, trying next..."
    done
    
    log ERROR "All import methods failed"
    return 1
}

# Function to generate final report
generate_final_report() {
    local start_time="$1"
    local end_time="$2"
    local status="$3"
    local csv_file="$4"
    local object="$5"
    
    local duration=$((end_time - start_time))
    local report_file="${LOG_DIR}/import_report_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
================================================================================
                            IMPORT EXECUTION REPORT
================================================================================
Date: $(date)
Duration: ${duration} seconds
Status: $status
Object: $object
Source File: $csv_file

EXECUTION SUMMARY
-----------------
$(tail -n 50 "$LOG_FILE" | grep -E '\[(SUCCESS|ERROR|WARNING)\]')

RECOMMENDATIONS
---------------
$(if [[ "$status" == "FAILED" ]]; then
    echo "1. Check validation rules in target org"
    echo "2. Verify field-level security for integration user"
    echo "3. Consider using Data Loader UI for manual review"
    echo "4. Check org storage limits"
else
    echo "1. Verify imported data in Salesforce"
    echo "2. Run post-import validation reports"
    echo "3. Check for any workflow/trigger errors"
fi)

LOG FILE
--------
Full log available at: $LOG_FILE

================================================================================
EOF
    
    echo -e "${CYAN}Report saved to: $report_file${NC}"
}

# Main function
main() {
    # Initialize variables
    local object=""
    local csv_file=""
    local org_alias=""
    local strategy="auto"
    local batch_size="$BATCH_SIZE"
    local parallel=1
    local VERBOSE=false
    
    # Parse arguments
    while getopts "o:f:a:s:b:p:vh" opt; do
        case $opt in
            o) object="$OPTARG";;
            f) csv_file="$OPTARG";;
            a) org_alias="$OPTARG";;
            s) strategy="$OPTARG";;
            b) batch_size="$OPTARG";;
            p) parallel="$OPTARG";;
            v) VERBOSE=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    # Validate required arguments
    if [[ -z "$object" ]] || [[ -z "$csv_file" ]]; then
        echo -e "${RED}Error: Object and CSV file are required${NC}"
        usage
    fi
    
    # Check if file exists
    if [[ ! -f "$csv_file" ]]; then
        echo -e "${RED}Error: File not found: $csv_file${NC}"
        exit 1
    fi
    
    # Setup logging
    LOG_FILE="${LOG_DIR}/import_$(date +%Y%m%d_%H%M%S).log"
    
    echo -e "${MAGENTA}╔══════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║     Smart Import Orchestrator v2.0      ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Object:${NC} $object"
    echo -e "${CYAN}File:${NC} $csv_file"
    echo -e "${CYAN}Strategy:${NC} $strategy"
    echo ""
    
    # Record start time
    local start_time=$(date +%s)
    
    # Run orchestration
    if orchestrate_import "$object" "$csv_file" "$org_alias" "$strategy"; then
        local status="SUCCESS"
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║          IMPORT SUCCESSFUL! ✓           ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    else
        local status="FAILED"
        echo ""
        echo -e "${RED}╔══════════════════════════════════════════╗${NC}"
        echo -e "${RED}║            IMPORT FAILED ✗              ║${NC}"
        echo -e "${RED}╚══════════════════════════════════════════╝${NC}"
    fi
    
    # Record end time
    local end_time=$(date +%s)
    
    # Generate report
    generate_final_report "$start_time" "$end_time" "$status" "$csv_file" "$object"
    
    # Cleanup
    log DEBUG "Cleaning up temporary files..."
    rm -rf "${WORK_DIR}"/*
    
    [[ "$status" == "SUCCESS" ]] && exit 0 || exit 1
}

# Run main function
main "$@"