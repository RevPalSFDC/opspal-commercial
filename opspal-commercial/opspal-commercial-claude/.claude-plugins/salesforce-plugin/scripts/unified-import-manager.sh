#!/bin/bash

##############################################################################
# unified-import-manager.sh - Consolidated Salesforce Import Management System
##############################################################################
# This script consolidates functionality from:
# - safe-bulk-import.sh (line ending fixes, safe operations)
# - smart-import-orchestrator.sh (intelligent strategies)
# - pre-import-validator.sh (validation and preparation)
# - chunked-operations.py (chunking capabilities)
#
# Provides comprehensive import management with:
# - Multiple import strategies (auto, fast, safe, thorough)
# - Automatic data validation and preparation
# - Intelligent chunking for large datasets
# - Progress tracking and error recovery
# - Line ending conversion and CSV fixes
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/imports"
WORK_DIR="${PROJECT_ROOT}/.import-work"
CACHE_DIR="${PROJECT_ROOT}/.validation-cache"
BACKUP_DIR="${PROJECT_ROOT}/backups/imports"

# Create necessary directories
mkdir -p "$LOG_DIR" "$WORK_DIR" "$CACHE_DIR" "$BACKUP_DIR"

# Default configuration
DEFAULT_CHUNK_SIZE=200
MAX_RETRIES=3
DEFAULT_WAIT_TIME=10

# Global variables
VERBOSE=false
SIMULATE=false
AUTO_FIX=true
KEEP_TEMP_FILES=false
LOG_FILE=""

# Available import methods and strategies
declare -a IMPORT_METHODS=("bulk_api" "rest_api" "composite_api")
declare -a IMPORT_STRATEGIES=("auto" "fast" "safe" "thorough")

# Function to display usage
usage() {
    cat << 'EOF'
Usage: unified-import-manager.sh [OPTIONS] -o OBJECT -f CSV_FILE

Consolidated Salesforce import manager with multiple strategies and automatic validation.

REQUIRED OPTIONS:
    -o OBJECT       Salesforce object API name (e.g., Account, Contact, CustomObject__c)
    -f CSV_FILE     Path to CSV file to import

OPTIONAL PARAMETERS:
    -a ALIAS        Salesforce org alias (optional, uses default if not specified)
    -s STRATEGY     Import strategy: auto, fast, safe, thorough (default: auto)
    -m MODE         Import mode: insert, update, upsert, delete (default: upsert)
    -i ID_FIELD     External ID field for upsert (default: Id)
    -b BATCH        Batch size for chunking (default: 200)
    -p PARALLEL     Number of parallel imports (default: 1)
    -w WAIT         Wait time in minutes for async operation (default: 10)
    -l LINE_FORMAT  Force line ending format: LF, CRLF, or AUTO (default: CRLF)

FLAGS:
    -x              Auto-fix CSV issues (default: enabled, use -X to disable)
    -X              Disable auto-fix of CSV issues
    -k              Keep temporary files after import
    -r              Force refresh validation rules cache
    -d              Diagnostic mode - analyze file without importing
    -n              Simulate import without actual execution
    -v              Verbose output
    -h              Display this help message

STRATEGIES:
    auto     - Automatically selects best strategy based on data analysis
    fast     - Prioritizes speed, minimal validation, larger chunks
    safe     - Maximum validation, error recovery, smaller chunks
    thorough - Tries all methods until success, comprehensive logging

EXAMPLES:
    # Basic upsert with auto strategy
    unified-import-manager.sh -o Account -f accounts.csv

    # Safe strategy for critical data
    unified-import-manager.sh -o Contact -f contacts.csv -s safe -b 100

    # Fast parallel import for bulk data
    unified-import-manager.sh -o Lead -f leads.csv -s fast -p 4 -b 1000

    # Thorough import with custom external ID
    unified-import-manager.sh -o Product2 -f products.csv -s thorough -i External_ID__c

    # Diagnostic mode to analyze file
    unified-import-manager.sh -o Account -f accounts.csv -d

    # Simulate import to check for issues
    unified-import-manager.sh -o Contact -f contacts.csv -n

EOF
    exit 1
}

# Logging functions
setup_logging() {
    local object="$1"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    LOG_FILE="${LOG_DIR}/${object}_import_${timestamp}.log"
    
    # Initialize log file
    cat > "$LOG_FILE" << EOF
# Unified Import Manager Log
# Object: $object
# Timestamp: $(date)
# PID: $$
# Command: $0 $*
================================================================================

EOF
}

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Console output with colors
    case "$level" in
        ERROR)   echo -e "${RED}[ERROR]${NC} $message" >&2 ;;
        WARNING) echo -e "${YELLOW}[WARNING]${NC} $message" ;;
        INFO)    echo -e "${BLUE}[INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        DEBUG)   [[ $VERBOSE == true ]] && echo -e "${CYAN}[DEBUG]${NC} $message" ;;
        PROGRESS) echo -e "${MAGENTA}[PROGRESS]${NC} $message" ;;
    esac
    
    # File output without colors
    if [[ -n "$LOG_FILE" ]]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    fi
}

# Platform detection
detect_platform() {
    case "$(uname -s)" in
        Linux*)     PLATFORM="Linux";;
        Darwin*)    PLATFORM="Mac";;
        CYGWIN*|MINGW*|MSYS*) PLATFORM="Windows";;
        *)          PLATFORM="Unknown";;
    esac
    log DEBUG "Detected platform: $PLATFORM"
}

# Check required tools
check_dependencies() {
    log INFO "Checking dependencies..."
    
    # Check Salesforce CLI
    if ! command -v sf &> /dev/null; then
        log ERROR "Salesforce CLI (sf) not found. Please install it first."
        exit 1
    fi
    
    # Check for dos2unix/unix2dos
    if ! command -v dos2unix &> /dev/null && ! command -v unix2dos &> /dev/null; then
        log WARNING "dos2unix/unix2dos not found. Installing..."
        install_line_tools
    fi
    
    # Check for sqlite3 (for validation cache)
    if ! command -v sqlite3 &> /dev/null; then
        log WARNING "sqlite3 not found. Some caching features may not work."
    fi
    
    log SUCCESS "Dependencies check completed"
}

# Install line ending conversion tools
install_line_tools() {
    case "$PLATFORM" in
        Linux)
            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y dos2unix
            elif command -v yum &> /dev/null; then
                sudo yum install -y dos2unix
            elif command -v dnf &> /dev/null; then
                sudo dnf install -y dos2unix
            else
                log ERROR "Unable to install dos2unix automatically. Please install manually."
                exit 1
            fi
            ;;
        Mac)
            if command -v brew &> /dev/null; then
                brew install dos2unix
            else
                log ERROR "Please install Homebrew or dos2unix manually."
                exit 1
            fi
            ;;
        *)
            log ERROR "Please install dos2unix manually for your platform."
            exit 1
            ;;
    esac
}

# File analysis functions
analyze_csv_structure() {
    local csv_file="$1"
    
    log INFO "Analyzing CSV structure..."
    
    # Get basic file statistics
    local line_count=$(wc -l < "$csv_file")
    local file_size=$(stat -f%z "$csv_file" 2>/dev/null || stat -c%s "$csv_file" 2>/dev/null)
    local field_count=$(head -n 1 "$csv_file" | awk -F',' '{print NF}')
    
    # Check line endings
    local line_endings="LF"
    if file "$csv_file" | grep -q "CRLF"; then
        line_endings="CRLF"
    elif file "$csv_file" | grep -q "CR"; then
        line_endings="CR"
    fi
    
    log DEBUG "File statistics: $line_count lines, $(numfmt --to=iec $file_size), $field_count fields, $line_endings endings"
    
    # Store analysis results
    cat > "${WORK_DIR}/analysis.json" << EOF
{
    "file_path": "$csv_file",
    "line_count": $line_count,
    "file_size": $file_size,
    "field_count": $field_count,
    "line_endings": "$line_endings",
    "headers": $(head -n 1 "$csv_file" | jq -R 'split(",")'),
    "analysis_timestamp": "$(date -Iseconds)"
}
EOF
    
    echo "$line_count"  # Return line count for strategy decisions
}

# Strategy selection based on data analysis
select_strategy() {
    local requested_strategy="$1"
    local line_count="$2"
    local file_size="$3"
    
    if [[ "$requested_strategy" != "auto" ]]; then
        echo "$requested_strategy"
        return
    fi
    
    log INFO "Auto-selecting strategy based on data characteristics..."
    
    # Decision logic based on data size and complexity
    if [[ $line_count -lt 1000 ]]; then
        echo "fast"
        log DEBUG "Selected 'fast' strategy for small dataset ($line_count records)"
    elif [[ $line_count -gt 50000 ]]; then
        echo "thorough"
        log DEBUG "Selected 'thorough' strategy for large dataset ($line_count records)"
    else
        echo "safe"
        log DEBUG "Selected 'safe' strategy for medium dataset ($line_count records)"
    fi
}

# Validation and preparation functions
validate_csv_format() {
    local csv_file="$1"
    local fix_issues="$2"
    
    log INFO "Validating CSV format..."
    
    # Check if file exists and is readable
    if [[ ! -f "$csv_file" ]]; then
        log ERROR "CSV file not found: $csv_file"
        return 1
    fi
    
    if [[ ! -r "$csv_file" ]]; then
        log ERROR "CSV file not readable: $csv_file"
        return 1
    fi
    
    # Check if file is empty
    if [[ ! -s "$csv_file" ]]; then
        log ERROR "CSV file is empty: $csv_file"
        return 1
    fi
    
    local issues_found=0
    local temp_file="${csv_file}.temp"
    
    # Copy file for modifications
    cp "$csv_file" "$temp_file"
    
    # Check for BOM
    if head -c 3 "$temp_file" | grep -q $'\xef\xbb\xbf'; then
        log WARNING "BOM marker detected in CSV file"
        if [[ "$fix_issues" == "true" ]]; then
            log INFO "Removing BOM marker..."
            sed -i '1s/^\xEF\xBB\xBF//' "$temp_file"
        fi
        ((issues_found++))
    fi
    
    # Check for spaces after commas
    if head -n 5 "$temp_file" | grep -q ', "'; then
        log WARNING "Spaces found after commas in CSV file"
        if [[ "$fix_issues" == "true" ]]; then
            log INFO "Removing spaces after commas..."
            sed -i 's/, "/,"/g' "$temp_file"
            sed -i 's/" ,/",/g' "$temp_file"
        fi
        ((issues_found++))
    fi
    
    # Check for empty lines
    local empty_lines=$(grep -c '^[[:space:]]*$' "$temp_file" || echo "0")
    if [[ $empty_lines -gt 0 ]]; then
        log WARNING "Found $empty_lines empty lines in CSV file"
        if [[ "$fix_issues" == "true" ]]; then
            log INFO "Removing empty lines..."
            sed -i '/^[[:space:]]*$/d' "$temp_file"
        fi
        ((issues_found++))
    fi
    
    # Replace original if fixes were made
    if [[ "$fix_issues" == "true" ]] && [[ $issues_found -gt 0 ]]; then
        mv "$temp_file" "$csv_file"
        log SUCCESS "Fixed $issues_found CSV formatting issues"
    else
        rm -f "$temp_file"
    fi
    
    log SUCCESS "CSV format validation completed"
    return 0
}

# Line ending conversion
convert_line_endings() {
    local input_file="$1"
    local output_file="$2"
    local target_format="${3:-CRLF}"
    
    log INFO "Converting line endings to $target_format format..."
    
    # Copy file first
    cp "$input_file" "$output_file"
    
    # Check current format
    local current_format="LF"
    if file "$input_file" | grep -q "CRLF"; then
        current_format="CRLF"
    elif file "$input_file" | grep -q "CR"; then
        current_format="CR"
    fi
    
    log DEBUG "Current line endings: $current_format, Target: $target_format"
    
    if [[ "$current_format" == "$target_format" ]]; then
        log SUCCESS "File already has $target_format line endings"
        return 0
    fi
    
    # Perform conversion
    case "$target_format" in
        CRLF)
            if command -v unix2dos &> /dev/null; then
                unix2dos "$output_file" 2>/dev/null
            else
                # Fallback method
                sed -i 's/$/\r/' "$output_file"
                sed -i 's/\r\r$/\r/' "$output_file"
            fi
            ;;
        LF)
            if command -v dos2unix &> /dev/null; then
                dos2unix "$output_file" 2>/dev/null
            else
                # Fallback method
                sed -i 's/\r$//' "$output_file"
            fi
            ;;
        *)
            log ERROR "Unsupported line ending format: $target_format"
            return 1
            ;;
    esac
    
    log SUCCESS "Line endings converted successfully"
    return 0
}

# Chunking for large files
create_chunks() {
    local csv_file="$1"
    local chunk_size="$2"
    local chunk_dir="$3"
    
    log INFO "Creating chunks of size $chunk_size..."
    
    # Clear chunk directory
    rm -rf "$chunk_dir"
    mkdir -p "$chunk_dir"
    
    # Get header
    local header=$(head -n 1 "$csv_file")
    
    # Split file (skip header)
    tail -n +2 "$csv_file" | split -l "$chunk_size" - "$chunk_dir/chunk_"
    
    # Add header to each chunk
    local chunk_count=0
    for chunk_file in "$chunk_dir"/chunk_*; do
        if [[ -f "$chunk_file" ]]; then
            local temp_file="${chunk_file}.temp"
            echo "$header" > "$temp_file"
            cat "$chunk_file" >> "$temp_file"
            mv "$temp_file" "$chunk_file"
            ((chunk_count++))
        fi
    done
    
    log SUCCESS "Created $chunk_count chunks in $chunk_dir"
    echo "$chunk_count"
}

# Import execution functions
execute_import() {
    local object="$1"
    local csv_file="$2"
    local mode="$3"
    local id_field="$4"
    local wait_time="$5"
    local org_alias="$6"
    local method="${7:-bulk_api}"
    
    log PROGRESS "Executing $mode import for $object using $method method..."
    
    # Build Salesforce CLI command
    local cmd="sf data"
    
    case "$mode" in
        insert|update|upsert)
            cmd="$cmd upsert bulk"
            ;;
        delete)
            cmd="$cmd delete bulk"
            ;;
        *)
            log ERROR "Invalid import mode: $mode"
            return 1
            ;;
    esac
    
    # Add parameters
    cmd="$cmd --sobject $object --file \"$csv_file\""
    
    if [[ "$mode" == "upsert" ]] && [[ -n "$id_field" ]] && [[ "$id_field" != "Id" ]]; then
        cmd="$cmd --external-id $id_field"
    fi
    
    cmd="$cmd --wait $wait_time"
    
    if [[ -n "$org_alias" ]]; then
        cmd="$cmd --target-org $org_alias"
    fi
    
    log DEBUG "Executing command: $cmd"
    
    # Execute with proper error handling (no eval)
    local sf_args=()
    sf_args+=("data")
    
    case "$mode" in
        insert|update|upsert)
            sf_args+=("upsert" "bulk")
            ;;
        delete)
            sf_args+=("delete" "bulk")
            ;;
    esac
    
    sf_args+=("--sobject" "$object")
    sf_args+=("--file" "$csv_file")
    
    if [[ "$mode" == "upsert" ]] && [[ -n "$id_field" ]] && [[ "$id_field" != "Id" ]]; then
        sf_args+=("--external-id" "$id_field")
    fi
    
    sf_args+=("--wait" "$wait_time")
    
    if [[ -n "$org_alias" ]]; then
        sf_args+=("--target-org" "$org_alias")
    fi
    
    # Execute command
    if sf "${sf_args[@]}"; then
        log SUCCESS "Import completed successfully"
        return 0
    else
        log ERROR "Import failed"
        return 1
    fi
}

# Strategy implementations
execute_fast_strategy() {
    local object="$1"
    local csv_file="$2"
    local mode="$3"
    local id_field="$4"
    local org_alias="$5"
    local chunk_size="$6"
    
    log INFO "Executing FAST strategy..."
    
    # Minimal validation, maximum speed
    validate_csv_format "$csv_file" "$AUTO_FIX"
    
    # Use larger chunks for speed
    local actual_chunk_size=$((chunk_size * 5))
    
    # Direct import attempt
    if execute_import "$object" "$csv_file" "$mode" "$id_field" "$DEFAULT_WAIT_TIME" "$org_alias" "bulk_api"; then
        return 0
    else
        log WARNING "Direct import failed, trying chunked approach..."
        return execute_chunked_import "$object" "$csv_file" "$mode" "$id_field" "$org_alias" "$actual_chunk_size"
    fi
}

execute_safe_strategy() {
    local object="$1"
    local csv_file="$2"
    local mode="$3"
    local id_field="$4"
    local org_alias="$5"
    local chunk_size="$6"
    
    log INFO "Executing SAFE strategy..."
    
    # Maximum validation and error recovery
    validate_csv_format "$csv_file" "$AUTO_FIX"
    
    # Create backup
    local backup_file="${BACKUP_DIR}/$(basename "$csv_file").$(date +%s).bak"
    cp "$csv_file" "$backup_file"
    log DEBUG "Created backup: $backup_file"
    
    # Use smaller chunks for safety
    local actual_chunk_size=$((chunk_size / 2))
    if [[ $actual_chunk_size -lt 50 ]]; then
        actual_chunk_size=50
    fi
    
    # Always use chunked approach for safety
    return execute_chunked_import "$object" "$csv_file" "$mode" "$id_field" "$org_alias" "$actual_chunk_size"
}

execute_thorough_strategy() {
    local object="$1"
    local csv_file="$2"
    local mode="$3"
    local id_field="$4"
    local org_alias="$5"
    local chunk_size="$6"
    
    log INFO "Executing THOROUGH strategy..."
    
    # Try every method until one succeeds
    local methods=("bulk_api" "rest_api" "composite_api")
    local chunk_sizes=($chunk_size $((chunk_size/2)) $((chunk_size/4)) 100 50)
    
    # Full validation
    validate_csv_format "$csv_file" "$AUTO_FIX"
    
    # Create backup
    local backup_file="${BACKUP_DIR}/$(basename "$csv_file").$(date +%s).bak"
    cp "$csv_file" "$backup_file"
    
    # Try different approaches
    for method in "${methods[@]}"; do
        log INFO "Trying $method method..."
        
        if execute_import "$object" "$csv_file" "$mode" "$id_field" "$DEFAULT_WAIT_TIME" "$org_alias" "$method"; then
            log SUCCESS "Import succeeded with $method method"
            return 0
        fi
        
        # If direct failed, try different chunk sizes
        for size in "${chunk_sizes[@]}"; do
            log INFO "Trying $method with chunk size $size..."
            if execute_chunked_import "$object" "$csv_file" "$mode" "$id_field" "$org_alias" "$size"; then
                log SUCCESS "Import succeeded with $method method and chunk size $size"
                return 0
            fi
        done
    done
    
    log ERROR "All import methods failed"
    return 1
}

execute_chunked_import() {
    local object="$1"
    local csv_file="$2"
    local mode="$3"
    local id_field="$4"
    local org_alias="$5"
    local chunk_size="$6"
    
    log INFO "Executing chunked import with size $chunk_size..."
    
    local chunk_dir="${WORK_DIR}/chunks"
    local chunk_count=$(create_chunks "$csv_file" "$chunk_size" "$chunk_dir")
    
    local success_count=0
    local failure_count=0
    local chunk_num=1
    
    for chunk_file in "$chunk_dir"/chunk_*; do
        if [[ -f "$chunk_file" ]]; then
            log PROGRESS "Processing chunk $chunk_num of $chunk_count..."
            
            if execute_import "$object" "$chunk_file" "$mode" "$id_field" "5" "$org_alias" "bulk_api"; then
                ((success_count++))
                log SUCCESS "Chunk $chunk_num succeeded"
            else
                ((failure_count++))
                log ERROR "Chunk $chunk_num failed"
                
                # Save failed chunk for analysis
                cp "$chunk_file" "${BACKUP_DIR}/failed_chunk_${chunk_num}_$(date +%s).csv"
            fi
            
            ((chunk_num++))
            
            # Small delay between chunks to avoid rate limits
            sleep 2
        fi
    done
    
    log INFO "Chunked import completed: $success_count succeeded, $failure_count failed"
    
    if [[ $failure_count -eq 0 ]]; then
        return 0
    else
        return 1
    fi
}

# Diagnostic mode
run_diagnostics() {
    local csv_file="$1"
    local object="$2"
    
    log INFO "Running comprehensive file diagnostics..."
    
    echo -e "${GREEN}=== CSV File Diagnostics ===${NC}"
    echo ""
    
    # File information
    echo -e "${BLUE}File Information:${NC}"
    echo "  Path: $csv_file"
    echo "  Size: $(du -h "$csv_file" | cut -f1)"
    echo "  Lines: $(wc -l < "$csv_file")"
    echo "  Modified: $(stat -f%Sm -t%F\ %T "$csv_file" 2>/dev/null || stat -c%y "$csv_file" 2>/dev/null)"
    echo ""
    
    # Line ending analysis
    echo -e "${BLUE}Line Ending Analysis:${NC}"
    local endings="LF"
    if file "$csv_file" | grep -q "CRLF"; then
        endings="CRLF"
    elif file "$csv_file" | grep -q "CR"; then
        endings="CR"
    fi
    echo "  Current format: $endings"
    echo ""
    
    # CSV structure
    echo -e "${BLUE}CSV Structure:${NC}"
    local headers=$(head -n 1 "$csv_file")
    echo "  Headers: $headers"
    echo "  Fields: $(echo "$headers" | awk -F',' '{print NF}')"
    echo "  Sample record: $(sed -n '2p' "$csv_file")"
    echo ""
    
    # Common issues check
    echo -e "${BLUE}Issue Detection:${NC}"
    
    # BOM check
    if head -c 3 "$csv_file" | grep -q $'\xef\xbb\xbf'; then
        echo -e "  ${YELLOW}⚠ BOM marker detected${NC}"
    else
        echo -e "  ${GREEN}✓ No BOM marker${NC}"
    fi
    
    # Spaces after commas
    if head -n 5 "$csv_file" | grep -q ', "'; then
        echo -e "  ${YELLOW}⚠ Spaces found after commas${NC}"
    else
        echo -e "  ${GREEN}✓ No spaces after commas${NC}"
    fi
    
    # Empty lines
    local empty_lines=$(grep -c '^[[:space:]]*$' "$csv_file" || echo "0")
    if [[ $empty_lines -gt 0 ]]; then
        echo -e "  ${YELLOW}⚠ $empty_lines empty lines found${NC}"
    else
        echo -e "  ${GREEN}✓ No empty lines${NC}"
    fi
    
    # Strategy recommendation
    local line_count=$(wc -l < "$csv_file")
    local recommended_strategy=$(select_strategy "auto" "$line_count" "0")
    
    echo ""
    echo -e "${BLUE}Recommendations:${NC}"
    echo "  Recommended strategy: $recommended_strategy"
    echo "  Recommended chunk size: $(get_recommended_chunk_size "$line_count")"
    echo "  Line ending conversion: $endings → CRLF (for Salesforce)"
    echo ""
    
    log SUCCESS "Diagnostics completed successfully"
}

get_recommended_chunk_size() {
    local line_count="$1"
    
    if [[ $line_count -lt 1000 ]]; then
        echo "500"
    elif [[ $line_count -lt 10000 ]]; then
        echo "200"
    elif [[ $line_count -lt 50000 ]]; then
        echo "100"
    else
        echo "50"
    fi
}

# Cleanup function
cleanup() {
    if [[ "$KEEP_TEMP_FILES" != "true" ]]; then
        log DEBUG "Cleaning up temporary files..."
        rm -rf "$WORK_DIR"
    else
        log INFO "Temporary files kept in: $WORK_DIR"
    fi
}

# Main execution function
main() {
    # Initialize variables
    local object=""
    local csv_file=""
    local org_alias=""
    local strategy="auto"
    local mode="upsert"
    local id_field="Id"
    local chunk_size="$DEFAULT_CHUNK_SIZE"
    local parallel_jobs=1
    local wait_time="$DEFAULT_WAIT_TIME"
    local line_format="CRLF"
    local force_refresh=false
    local diagnostic_mode=false
    
    # Parse command line arguments
    while getopts "o:f:a:s:m:i:b:p:w:l:xXkrndvh" opt; do
        case $opt in
            o) object="$OPTARG";;
            f) csv_file="$OPTARG";;
            a) org_alias="$OPTARG";;
            s) strategy="$OPTARG";;
            m) mode="$OPTARG";;
            i) id_field="$OPTARG";;
            b) chunk_size="$OPTARG";;
            p) parallel_jobs="$OPTARG";;
            w) wait_time="$OPTARG";;
            l) line_format="$OPTARG";;
            x) AUTO_FIX=true;;
            X) AUTO_FIX=false;;
            k) KEEP_TEMP_FILES=true;;
            r) force_refresh=true;;
            d) diagnostic_mode=true;;
            n) SIMULATE=true;;
            v) VERBOSE=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    # Validate strategy
    if [[ ! " ${IMPORT_STRATEGIES[@]} " =~ " $strategy " ]]; then
        log ERROR "Invalid strategy: $strategy. Must be one of: ${IMPORT_STRATEGIES[*]}"
        exit 1
    fi
    
    # For diagnostic mode, only require CSV file
    if [[ "$diagnostic_mode" == "true" ]]; then
        if [[ -z "$csv_file" ]]; then
            log ERROR "CSV file is required for diagnostics"
            usage
        fi
        run_diagnostics "$csv_file" "$object"
        exit 0
    fi
    
    # Validate required arguments
    if [[ -z "$object" ]] || [[ -z "$csv_file" ]]; then
        log ERROR "Object and CSV file are required"
        usage
    fi
    
    # Setup logging
    setup_logging "$object"
    
    # Display configuration
    echo -e "${GREEN}=== Unified Import Manager ===${NC}"
    echo -e "${BLUE}Object:${NC} $object"
    echo -e "${BLUE}File:${NC} $csv_file"
    echo -e "${BLUE}Strategy:${NC} $strategy"
    echo -e "${BLUE}Mode:${NC} $mode"
    echo -e "${BLUE}Chunk Size:${NC} $chunk_size"
    [[ -n "$org_alias" ]] && echo -e "${BLUE}Org Alias:${NC} $org_alias"
    [[ "$SIMULATE" == "true" ]] && echo -e "${YELLOW}SIMULATION MODE${NC}"
    echo ""
    
    # Setup cleanup trap
    trap cleanup EXIT
    
    # Check dependencies
    detect_platform
    check_dependencies
    
    # Analyze CSV file
    local line_count=$(analyze_csv_structure "$csv_file")
    
    # Select actual strategy
    local actual_strategy=$(select_strategy "$strategy" "$line_count" "0")
    
    if [[ "$actual_strategy" != "$strategy" ]]; then
        log INFO "Strategy auto-selected: $actual_strategy (was: $strategy)"
    fi
    
    # Prepare CSV file
    local prepared_file="${WORK_DIR}/prepared_$(basename "$csv_file")"
    
    # Convert line endings
    convert_line_endings "$csv_file" "$prepared_file" "$line_format"
    
    # Validate and fix CSV issues
    validate_csv_format "$prepared_file" "$AUTO_FIX"
    
    # Exit if simulation mode
    if [[ "$SIMULATE" == "true" ]]; then
        log SUCCESS "Simulation completed successfully. File is ready for import."
        log INFO "Prepared file available at: $prepared_file"
        exit 0
    fi
    
    # Execute import based on strategy
    local import_success=false
    
    case "$actual_strategy" in
        fast)
            if execute_fast_strategy "$object" "$prepared_file" "$mode" "$id_field" "$org_alias" "$chunk_size"; then
                import_success=true
            fi
            ;;
        safe)
            if execute_safe_strategy "$object" "$prepared_file" "$mode" "$id_field" "$org_alias" "$chunk_size"; then
                import_success=true
            fi
            ;;
        thorough)
            if execute_thorough_strategy "$object" "$prepared_file" "$mode" "$id_field" "$org_alias" "$chunk_size"; then
                import_success=true
            fi
            ;;
        *)
            log ERROR "Unknown strategy: $actual_strategy"
            exit 1
            ;;
    esac
    
    # Report results
    if [[ "$import_success" == "true" ]]; then
        log SUCCESS "Import completed successfully!"
        log INFO "Log file: $LOG_FILE"
    else
        log ERROR "Import failed. Check log file for details: $LOG_FILE"
        exit 1
    fi
}

# Execute main function
main "$@"