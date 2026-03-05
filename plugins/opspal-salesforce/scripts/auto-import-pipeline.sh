#!/bin/bash

# Automated Import Pipeline for Salesforce
# Runs all validation, fixes issues, and imports with retry logic

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_ROOT/logs/pipeline"
REPORTS_DIR="$PROJECT_ROOT/reports/pipeline"
PROCESSED_DIR="$PROJECT_ROOT/data/processed"
FAILED_DIR="$PROJECT_ROOT/data/failed"

# Include validators
FIELD_VERIFIER="$SCRIPT_DIR/field-verifier.sh"
PICKLIST_VALIDATOR="$SCRIPT_DIR/picklist-validator.sh"
CSV_SANITIZER="$SCRIPT_DIR/csv-sanitizer.sh"
VALIDATION_ANALYZER="$SCRIPT_DIR/validation-rule-analyzer.sh"
PREFLIGHT_CHECK="$SCRIPT_DIR/preflight-check.sh"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$LOGS_DIR" "$REPORTS_DIR" "$PROCESSED_DIR" "$FAILED_DIR"

# Pipeline configuration
MAX_RETRIES=3
AUTO_FIX=true
BATCH_SIZE=200
SUCCESS_THRESHOLD=80

# Load environment
source "$PROJECT_ROOT/.env" 2>/dev/null || true

# Pipeline statistics
TOTAL_RECORDS=0
PROCESSED_RECORDS=0
FAILED_RECORDS=0
PIPELINE_START_TIME=$(date +%s)

# Function to log messages
log_message() {
    local level="$1"
    local message="$2"
    local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[$timestamp] [$level] $message" >> "$LOGS_DIR/pipeline_$(date +%Y%m%d).log"
    
    case "$level" in
        INFO)
            echo -e "${BLUE}[INFO]${NC} $message"
            ;;
        SUCCESS)
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
        WARNING)
            echo -e "${YELLOW}[WARNING]${NC} $message"
            ;;
        ERROR)
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
    esac
}

# Function to create pipeline report
create_pipeline_report() {
    local csv_file="$1"
    local object_name="$2"
    local status="$3"
    local report_file="$REPORTS_DIR/pipeline_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" << EOF
{
    "pipeline_run": {
        "timestamp": "$(date -Iseconds)",
        "file": "$csv_file",
        "object": "$object_name",
        "status": "$status",
        "statistics": {
            "total_records": $TOTAL_RECORDS,
            "processed": $PROCESSED_RECORDS,
            "failed": $FAILED_RECORDS,
            "success_rate": $(echo "scale=2; $PROCESSED_RECORDS * 100 / $TOTAL_RECORDS" | bc)
        },
        "duration_seconds": $(($(date +%s) - PIPELINE_START_TIME)),
        "auto_fixes_applied": $AUTO_FIXES_APPLIED,
        "validation_issues": $VALIDATION_ISSUES_FOUND
    }
}
EOF
    
    log_message "INFO" "Pipeline report created: $report_file"
}

# Function to auto-fix common issues
auto_fix_issues() {
    local csv_file="$1"
    local object_name="$2"
    local fixed_file="${csv_file%.csv}_fixed.csv"
    local fixes_applied=0
    
    log_message "INFO" "Attempting auto-fix for $csv_file"
    
    # Step 1: Sanitize CSV (line endings, encoding, etc.)
    if [ -f "$CSV_SANITIZER" ]; then
        log_message "INFO" "Sanitizing CSV file..."
        $CSV_SANITIZER sanitize "$csv_file" all >/dev/null 2>&1
        if [ -f "${csv_file%.csv}_sanitized.csv" ]; then
            mv "${csv_file%.csv}_sanitized.csv" "$fixed_file"
            ((fixes_applied++))
            log_message "SUCCESS" "CSV sanitized"
        fi
    fi
    
    # Step 2: Apply validation rule defaults
    local defaults_file="$PROJECT_ROOT/config/safe_defaults_${object_name}.json"
    if [ ! -f "$defaults_file" ] && [ -f "$VALIDATION_ANALYZER" ]; then
        log_message "INFO" "Generating safe defaults for $object_name..."
        $VALIDATION_ANALYZER defaults "$object_name" >/dev/null 2>&1
    fi
    
    if [ -f "$defaults_file" ]; then
        log_message "INFO" "Applying safe defaults..."
        local bypass_script="$SCRIPT_DIR/bypass_${object_name}_validation.sh"
        if [ -f "$bypass_script" ]; then
            $bypass_script "$fixed_file" >/dev/null 2>&1
            ((fixes_applied++))
            log_message "SUCCESS" "Safe defaults applied"
        fi
    fi
    
    # Step 3: Fix field name case mismatches
    log_message "INFO" "Checking field names..."
    local headers=$(head -1 "$fixed_file" | tr ',' '\n' | tr -d '"')
    local new_headers=""
    
    while IFS= read -r field; do
        [ -z "$field" ] && continue
        
        # Check if field exists with different case
        local correct_field=$($FIELD_VERIFIER verify "$object_name" "$field" 2>&1 | grep "different case" | sed -n 's/.*case: \([^ ]*\).*/\1/p')
        
        if [ -n "$correct_field" ]; then
            new_headers="${new_headers}${correct_field},"
            ((fixes_applied++))
            log_message "WARNING" "Fixed field case: $field → $correct_field"
        else
            new_headers="${new_headers}${field},"
        fi
    done <<< "$headers"
    
    # Update headers if changes were made
    if [ $fixes_applied -gt 0 ]; then
        new_headers="${new_headers%,}"  # Remove trailing comma
        sed -i "1s/.*/$new_headers/" "$fixed_file"
    fi
    
    AUTO_FIXES_APPLIED=$fixes_applied
    
    if [ $fixes_applied -gt 0 ]; then
        echo "$fixed_file"
        log_message "SUCCESS" "Applied $fixes_applied auto-fixes"
    else
        echo "$csv_file"
        log_message "INFO" "No auto-fixes needed"
    fi
}

# Function to validate picklist fields
validate_picklist_fields() {
    local csv_file="$1"
    local object_name="$2"
    local picklist_fields="$3"
    
    if [ -z "$picklist_fields" ] || [ ! -f "$PICKLIST_VALIDATOR" ]; then
        return 0
    fi
    
    log_message "INFO" "Validating picklist fields: $picklist_fields"
    
    IFS=',' read -ra fields <<< "$picklist_fields"
    local all_valid=true
    
    for field in "${fields[@]}"; do
        field=$(echo "$field" | xargs)
        
        # Get column number
        local col_num=$(head -1 "$csv_file" | tr ',' '\n' | grep -n "^\"*$field\"*$" | cut -d: -f1)
        
        if [ -n "$col_num" ]; then
            $PICKLIST_VALIDATOR csv "$csv_file" "$object_name" "$field" "" "$col_num" >/dev/null 2>&1
            if [ $? -ne 0 ]; then
                all_valid=false
                log_message "WARNING" "Picklist validation failed for $field"
            fi
        fi
    done
    
    $all_valid
}

# Function to perform Salesforce import
perform_import() {
    local csv_file="$1"
    local object_name="$2"
    local operation="${3:-insert}"
    local attempt="${4:-1}"
    
    log_message "INFO" "Importing to Salesforce (attempt $attempt/$MAX_RETRIES)..."
    
    # Prepare import command based on operation
    local import_cmd=""
    
    case "$operation" in
        insert|create)
            import_cmd="sf data import bulk --sobject $object_name --file '$csv_file' --wait 10"
            ;;
        update)
            import_cmd="sf data update bulk --sobject $object_name --file '$csv_file' --wait 10"
            ;;
        upsert)
            import_cmd="sf data upsert bulk --sobject $object_name --file '$csv_file' --external-id Id --wait 10"
            ;;
        *)
            log_message "ERROR" "Unknown operation: $operation"
            return 1
            ;;
    esac
    
    # Execute import
    local result=$($import_cmd 2>&1)
    local status=$?
    
    if [ $status -eq 0 ]; then
        # Parse success results
        local records_processed=$(echo "$result" | grep -oE 'Records processed: [0-9]+' | grep -oE '[0-9]+' || echo "0")
        local records_failed=$(echo "$result" | grep -oE 'Records failed: [0-9]+' | grep -oE '[0-9]+' || echo "0")
        
        PROCESSED_RECORDS=$((PROCESSED_RECORDS + records_processed))
        FAILED_RECORDS=$((FAILED_RECORDS + records_failed))
        
        local success_rate=100
        if [ "$records_processed" -gt 0 ]; then
            success_rate=$(echo "scale=2; ($records_processed - $records_failed) * 100 / $records_processed" | bc)
        fi
        
        log_message "SUCCESS" "Import completed: $records_processed processed, $records_failed failed (${success_rate}% success)"
        
        # Check if success rate meets threshold
        if (( $(echo "$success_rate >= $SUCCESS_THRESHOLD" | bc -l) )); then
            return 0
        else
            log_message "WARNING" "Success rate below threshold: ${success_rate}% < ${SUCCESS_THRESHOLD}%"
            return 1
        fi
    else
        log_message "ERROR" "Import failed: $result"
        
        # Check for specific errors and attempt fixes
        if echo "$result" | grep -q "INVALID_FIELD"; then
            log_message "WARNING" "Invalid field detected, attempting field verification..."
            return 2
        elif echo "$result" | grep -q "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST"; then
            log_message "WARNING" "Picklist restriction detected, attempting value mapping..."
            return 3
        elif echo "$result" | grep -q "FIELD_CUSTOM_VALIDATION_EXCEPTION"; then
            log_message "WARNING" "Validation rule triggered, attempting bypass..."
            return 4
        else
            return 1
        fi
    fi
}

# Function to split large files
split_large_file() {
    local csv_file="$1"
    local batch_size="${2:-200}"
    
    local total_lines=$(($(wc -l < "$csv_file") - 1))  # Exclude header
    
    if [ $total_lines -le $batch_size ]; then
        echo "$csv_file"
        return
    fi
    
    log_message "INFO" "Splitting file into batches of $batch_size records..."
    
    local header=$(head -1 "$csv_file")
    local base_name="${csv_file%.csv}"
    local batch_num=1
    local batch_files=""
    
    # Split the file (excluding header)
    tail -n +2 "$csv_file" | split -l $batch_size - "${base_name}_batch_"
    
    # Add header to each batch
    for batch in ${base_name}_batch_*; do
        local batch_csv="${batch}.csv"
        echo "$header" > "$batch_csv"
        cat "$batch" >> "$batch_csv"
        rm "$batch"
        batch_files="$batch_files $batch_csv"
        log_message "INFO" "Created batch: $batch_csv"
    done
    
    echo "$batch_files"
}

# Main pipeline function
run_pipeline() {
    local csv_file="$1"
    local object_name="$2"
    local operation="${3:-insert}"
    local picklist_fields="${4:-}"
    
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║    AUTOMATED IMPORT PIPELINE           ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    log_message "INFO" "Starting pipeline for: $csv_file → $object_name ($operation)"
    
    # Check file exists
    if [ ! -f "$csv_file" ]; then
        log_message "ERROR" "File not found: $csv_file"
        return 1
    fi
    
    # Count total records
    TOTAL_RECORDS=$(($(wc -l < "$csv_file") - 1))
    log_message "INFO" "Total records to process: $TOTAL_RECORDS"
    
    # Step 1: Pre-flight check
    echo -e "\n${CYAN}Step 1: Pre-flight Check${NC}"
    $PREFLIGHT_CHECK check "$csv_file" "$object_name" "$operation" "$picklist_fields" > /dev/null 2>&1
    local preflight_status=$?
    
    VALIDATION_ISSUES_FOUND=0
    
    if [ $preflight_status -ne 0 ]; then
        log_message "WARNING" "Pre-flight check found issues (status: $preflight_status)"
        VALIDATION_ISSUES_FOUND=$preflight_status
        
        if [ "$AUTO_FIX" = true ]; then
            echo -e "\n${CYAN}Step 2: Auto-Fix Issues${NC}"
            csv_file=$(auto_fix_issues "$csv_file" "$object_name")
            
            # Re-run pre-flight after fixes
            echo -e "\n${CYAN}Step 3: Re-validate After Fixes${NC}"
            $PREFLIGHT_CHECK quick "$csv_file" "$object_name" > /dev/null 2>&1
            if [ $? -ne 0 ]; then
                log_message "WARNING" "Issues remain after auto-fix, proceeding with caution"
            else
                log_message "SUCCESS" "All issues resolved by auto-fix"
            fi
        fi
    else
        log_message "SUCCESS" "Pre-flight check passed"
    fi
    
    # Step 4: Split large files if needed
    echo -e "\n${CYAN}Step 4: Prepare Import Batches${NC}"
    local batch_files=$(split_large_file "$csv_file" $BATCH_SIZE)
    
    # Step 5: Import with retry logic
    echo -e "\n${CYAN}Step 5: Import to Salesforce${NC}"
    local overall_success=true
    
    for batch in $batch_files; do
        local batch_success=false
        local attempt=1
        
        while [ $attempt -le $MAX_RETRIES ] && [ "$batch_success" = false ]; do
            perform_import "$batch" "$object_name" "$operation" "$attempt"
            local import_status=$?
            
            if [ $import_status -eq 0 ]; then
                batch_success=true
                log_message "SUCCESS" "Batch imported successfully: $batch"
                
                # Move to processed
                mv "$batch" "$PROCESSED_DIR/"
            elif [ $import_status -eq 2 ] || [ $import_status -eq 3 ] || [ $import_status -eq 4 ]; then
                # Specific error that might be fixable
                if [ $attempt -lt $MAX_RETRIES ]; then
                    log_message "INFO" "Attempting to fix and retry..."
                    batch=$(auto_fix_issues "$batch" "$object_name")
                fi
            fi
            
            ((attempt++))
        done
        
        if [ "$batch_success" = false ]; then
            overall_success=false
            log_message "ERROR" "Failed to import batch after $MAX_RETRIES attempts: $batch"
            
            # Move to failed directory
            mv "$batch" "$FAILED_DIR/"
        fi
    done
    
    # Step 6: Generate report
    echo -e "\n${CYAN}Step 6: Generate Report${NC}"
    local pipeline_status="SUCCESS"
    [ "$overall_success" = false ] && pipeline_status="PARTIAL_FAILURE"
    
    create_pipeline_report "$csv_file" "$object_name" "$pipeline_status"
    
    # Step 7: Summary
    echo -e "\n${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║         PIPELINE SUMMARY               ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    
    local success_rate=0
    if [ $TOTAL_RECORDS -gt 0 ]; then
        success_rate=$(echo "scale=2; ($PROCESSED_RECORDS - $FAILED_RECORDS) * 100 / $TOTAL_RECORDS" | bc)
    fi
    
    echo "Total Records: $TOTAL_RECORDS"
    echo -e "${GREEN}Processed: $PROCESSED_RECORDS${NC}"
    echo -e "${RED}Failed: $FAILED_RECORDS${NC}"
    echo "Success Rate: ${success_rate}%"
    echo "Duration: $(($(date +%s) - PIPELINE_START_TIME)) seconds"
    
    if [ "$overall_success" = true ]; then
        log_message "SUCCESS" "Pipeline completed successfully!"
        return 0
    else
        log_message "WARNING" "Pipeline completed with errors. Check failed directory."
        return 1
    fi
}

# Function to run pipeline on directory
run_batch_pipeline() {
    local directory="$1"
    local object_name="$2"
    local operation="${3:-insert}"
    
    log_message "INFO" "Starting batch pipeline for directory: $directory"
    
    local total_files=0
    local successful_files=0
    
    for csv_file in "$directory"/*.csv; do
        [ -f "$csv_file" ] || continue
        
        ((total_files++))
        echo -e "\n${MAGENTA}Processing file $total_files: $(basename "$csv_file")${NC}"
        
        run_pipeline "$csv_file" "$object_name" "$operation"
        if [ $? -eq 0 ]; then
            ((successful_files++))
        fi
        
        # Reset counters for next file
        TOTAL_RECORDS=0
        PROCESSED_RECORDS=0
        FAILED_RECORDS=0
    done
    
    echo -e "\n${BLUE}═══ Batch Pipeline Complete ═══${NC}"
    echo "Files processed: $total_files"
    echo "Successful: $successful_files"
    echo "Failed: $((total_files - successful_files))"
}

# Function to show pipeline status
show_pipeline_status() {
    echo -e "${BLUE}═══ Pipeline Status ═══${NC}"
    
    # Check processed files
    local processed_count=$(ls -1 "$PROCESSED_DIR"/*.csv 2>/dev/null | wc -l)
    local failed_count=$(ls -1 "$FAILED_DIR"/*.csv 2>/dev/null | wc -l)
    
    echo "Processed files: $processed_count"
    echo "Failed files: $failed_count"
    
    # Show recent logs
    echo -e "\n${CYAN}Recent Activity:${NC}"
    tail -5 "$LOGS_DIR/pipeline_$(date +%Y%m%d).log" 2>/dev/null || echo "No activity today"
    
    # Show latest report
    local latest_report=$(ls -t "$REPORTS_DIR"/pipeline_*.json 2>/dev/null | head -1)
    if [ -n "$latest_report" ]; then
        echo -e "\n${CYAN}Latest Report:${NC}"
        jq -r '.pipeline_run | "  File: \(.file)\n  Object: \(.object)\n  Status: \(.status)\n  Success Rate: \(.statistics.success_rate)%"' "$latest_report"
    fi
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}═══ Automated Import Pipeline ═══${NC}"
    echo "1) Run pipeline for single file"
    echo "2) Run pipeline for directory"
    echo "3) Show pipeline status"
    echo "4) View processed files"
    echo "5) View failed files"
    echo "6) Clear processed/failed directories"
    echo "7) Configure pipeline settings"
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
                echo -n "CSV file path: "
                read -r csv_file
                echo -n "Salesforce object: "
                read -r object
                echo -n "Operation (insert/update/upsert): "
                read -r operation
                echo -n "Picklist fields (comma-separated, optional): "
                read -r picklists
                run_pipeline "$csv_file" "$object" "$operation" "$picklists"
                ;;
            2)
                echo -n "Directory path: "
                read -r directory
                echo -n "Salesforce object: "
                read -r object
                echo -n "Operation (insert/update/upsert): "
                read -r operation
                run_batch_pipeline "$directory" "$object" "$operation"
                ;;
            3)
                show_pipeline_status
                ;;
            4)
                echo -e "${CYAN}Processed files:${NC}"
                ls -la "$PROCESSED_DIR"/*.csv 2>/dev/null || echo "No processed files"
                ;;
            5)
                echo -e "${CYAN}Failed files:${NC}"
                ls -la "$FAILED_DIR"/*.csv 2>/dev/null || echo "No failed files"
                ;;
            6)
                echo -n "Clear processed and failed directories? (y/n): "
                read -r confirm
                if [ "$confirm" = "y" ]; then
                    rm -f "$PROCESSED_DIR"/*.csv "$FAILED_DIR"/*.csv
                    echo -e "${GREEN}✓ Directories cleared${NC}"
                fi
                ;;
            7)
                echo -e "${CYAN}Current Settings:${NC}"
                echo "  Auto-fix: $AUTO_FIX"
                echo "  Batch size: $BATCH_SIZE"
                echo "  Max retries: $MAX_RETRIES"
                echo "  Success threshold: $SUCCESS_THRESHOLD%"
                echo ""
                echo "Edit this script to change settings"
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
        run)
            run_pipeline "$2" "$3" "${4:-insert}" "${5:-}"
            ;;
        batch)
            run_batch_pipeline "$2" "$3" "${4:-insert}"
            ;;
        status)
            show_pipeline_status
            ;;
        help)
            echo "Usage: $0 {run|batch|status|help} [options]"
            echo ""
            echo "Commands:"
            echo "  run <csv> <object> [op] [fields]  - Run pipeline for single file"
            echo "  batch <dir> <object> [op]         - Run pipeline for directory"
            echo "  status                             - Show pipeline status"
            echo "  help                               - Show this help"
            echo ""
            echo "Operations: insert, update, upsert"
            exit 0
            ;;
        *)
            echo "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
fi