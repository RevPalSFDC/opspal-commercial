#!/bin/bash

################################################################################
# job-monitor.sh - Monitor Salesforce bulk job status until completion
################################################################################
# Polls job status and ensures operations actually complete successfully
################################################################################

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
LOG_DIR="$SCRIPT_DIR/../logs/job-monitor"
CACHE_DIR="$SCRIPT_DIR/../.cache/jobs"

# Create directories
mkdir -p "$LOG_DIR" "$CACHE_DIR"

# Default settings
DEFAULT_POLL_INTERVAL=5      # seconds
DEFAULT_MAX_WAIT=1800        # 30 minutes
DEFAULT_FAILURE_THRESHOLD=0.05  # 5% failure rate acceptable

# Job states
JOB_STATE_OPEN="Open"
JOB_STATE_UPLOAD_COMPLETE="UploadComplete"
JOB_STATE_IN_PROGRESS="InProgress"
JOB_STATE_JOB_COMPLETE="JobComplete"
JOB_STATE_FAILED="Failed"
JOB_STATE_ABORTED="Aborted"

usage() {
    cat << EOF
Usage: $0 [OPTIONS] JOB_ID

Monitor Salesforce bulk job status until completion.

OPTIONS:
    -o ORG        Salesforce org alias
    -t TYPE       Job type (ingest, query, delete)
    -i INTERVAL   Poll interval in seconds (default: $DEFAULT_POLL_INTERVAL)
    -w WAIT       Maximum wait time in seconds (default: $DEFAULT_MAX_WAIT)
    -f THRESHOLD  Failure threshold percentage (default: 5%)
    -v            Verbose output
    -j            Output JSON format
    -n            No color output
    -r            Show raw response
    -h            Display this help

EXAMPLES:
    # Monitor a bulk upload job
    $0 -o myorg 7501t00000ABCDEF
    
    # Monitor with custom interval and timeout
    $0 -i 10 -w 3600 7501t00000ABCDEF
    
    # Get JSON output for automation
    $0 -j 7501t00000ABCDEF

JOB STATES:
    - Open: Job created, waiting for batches
    - UploadComplete: All data uploaded
    - InProgress: Processing records
    - JobComplete: Processing finished
    - Failed: Job failed
    - Aborted: Job was aborted

EXIT CODES:
    0: Job completed successfully
    1: Job failed or aborted
    2: Timeout reached
    3: Invalid arguments
    4: API error

EOF
    exit 3
}

# Logging
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    local log_file="$LOG_DIR/monitor-$(date +%Y%m%d).log"
    
    echo "[$timestamp] [$level] Job $JOB_ID: $message" >> "$log_file"
    
    if [ "$JSON_OUTPUT" != "true" ] && [ "$level" != "DEBUG" -o "$VERBOSE" = "true" ]; then
        case "$level" in
            ERROR)
                echo -e "${RED}❌ $message${NC}" >&2
                ;;
            WARNING)
                echo -e "${YELLOW}⚠️  $message${NC}"
                ;;
            SUCCESS)
                echo -e "${GREEN}✅ $message${NC}"
                ;;
            INFO)
                [ "$VERBOSE" = "true" ] && echo -e "${BLUE}ℹ️  $message${NC}"
                ;;
            PROGRESS)
                echo -e "${CYAN}⏳ $message${NC}"
                ;;
            DEBUG)
                [ "$VERBOSE" = "true" ] && echo -e "${MAGENTA}🔍 $message${NC}"
                ;;
        esac
    fi
}

# Get job status from Salesforce
get_job_status() {
    local job_id="$1"
    local job_type="${2:-ingest}"
    
    # Build API endpoint based on job type
    local endpoint=""
    case "$job_type" in
        ingest|upload)
            endpoint="/services/data/v60.0/jobs/ingest/${job_id}"
            ;;
        query)
            endpoint="/services/data/v60.0/jobs/query/${job_id}"
            ;;
        delete)
            endpoint="/services/data/v60.0/jobs/ingest/${job_id}"
            ;;
        *)
            log_message "ERROR" "Unknown job type: $job_type"
            return 1
            ;;
    esac
    
    # Avoid fragile `sf ... | python ...` pipelines by explicitly splitting:
    # 1) fetch org auth JSON
    # 2) parse token/instance
    # 3) call REST endpoint via curl
    local org_json
    org_json=$(sf org display --target-org "$ORG_ALIAS" --json 2>/dev/null || true)
    if [ -z "$org_json" ]; then
        echo '{"error":"Failed to read org authentication via sf org display"}'
        return 0
    fi

    if ! command -v jq >/dev/null 2>&1; then
        echo '{"error":"jq is required to parse org authentication output"}'
        return 0
    fi

    local access_token instance_url
    access_token=$(echo "$org_json" | jq -r '.result.accessToken // empty' 2>/dev/null)
    instance_url=$(echo "$org_json" | jq -r '.result.instanceUrl // empty' 2>/dev/null)

    if [ -z "$access_token" ] || [ -z "$instance_url" ]; then
        echo '{"error":"Could not extract accessToken/instanceUrl from sf org display output"}'
        return 0
    fi

    local url="${instance_url}${endpoint}"
    local timeout_seconds="${JOB_STATUS_TIMEOUT_SECONDS:-20}"
    local http_response
    http_response=$(curl -sS --max-time "$timeout_seconds" -w "\n%{http_code}" \
      -H "Authorization: Bearer ${access_token}" \
      -H "Accept: application/json" \
      "$url" 2>/dev/null || true)

    if [ -z "$http_response" ]; then
        echo '{"error":"Empty response from Salesforce job status endpoint"}'
        return 0
    fi

    local http_code body
    http_code=$(echo "$http_response" | tail -n 1)
    body=$(echo "$http_response" | sed '$d')

    if [ "$http_code" != "200" ]; then
        echo "{\"error\":\"Salesforce API returned HTTP ${http_code}\",\"body\":${body:-\"\"}}"
        return 0
    fi

    if ! echo "$body" | jq -e . >/dev/null 2>&1; then
        echo '{"error":"Salesforce API returned non-JSON payload"}'
        return 0
    fi

    echo "$body"
}

# Parse job status response
parse_job_status() {
    local response="$1"
    
    # Save raw response if requested
    if [ "$SHOW_RAW" = "true" ]; then
        echo "$response" > "$CACHE_DIR/${JOB_ID}_raw_$(date +%s).json"
    fi
    
    # Parse using Python
    echo "$response" | python3 -c "
import json
import sys

try:
    data = json.load(sys.stdin)
    
    # Handle different response formats
    if 'result' in data:
        result = data['result']
    else:
        result = data

    # Normalize explicit error payloads from get_job_status
    if isinstance(result, dict) and 'error' in result:
        print('STATE=ERROR')
        print(f'ERROR_MESSAGE={result.get("error", "Unknown API error")}')
        sys.exit(0)

    if not isinstance(result, dict) or 'state' not in result:
        print('STATE=ERROR')
        print('ERROR_MESSAGE=Invalid job status payload (missing state)')
        sys.exit(0)
    
    # Extract key fields
    state = result.get('state', 'Unknown')
    job_type = result.get('jobType', 'Unknown')
    object_name = result.get('object', 'Unknown')
    operation = result.get('operation', 'Unknown')
    
    # Processing stats
    records_processed = result.get('numberRecordsProcessed', 0)
    records_failed = result.get('numberRecordsFailed', 0)
    records_total = result.get('numberBatchesTotal', 0) * 10000  # Estimate
    
    # Timing
    created_date = result.get('createdDate', '')
    system_mod_stamp = result.get('systemModstamp', '')
    
    # Error info
    error_message = result.get('errorMessage', '')
    
    # Output format
    print(f'STATE={state}')
    print(f'JOB_TYPE={job_type}')
    print(f'OBJECT={object_name}')
    print(f'OPERATION={operation}')
    print(f'RECORDS_PROCESSED={records_processed}')
    print(f'RECORDS_FAILED={records_failed}')
    print(f'RECORDS_TOTAL={records_total}')
    print(f'CREATED={created_date}')
    print(f'MODIFIED={system_mod_stamp}')
    print(f'ERROR_MESSAGE={error_message}')
    
except Exception as e:
    print(f'STATE=ERROR')
    print(f'ERROR_MESSAGE={str(e)}')
" 2>/dev/null
}

# Display progress bar
show_progress() {
    local current=$1
    local total=$2
    local state=$3
    
    if [ "$JSON_OUTPUT" = "true" ] || [ "$NO_COLOR" = "true" ]; then
        return
    fi
    
    local percentage=0
    if [ $total -gt 0 ]; then
        percentage=$((current * 100 / total))
    fi
    
    local bar_length=50
    local filled=$((percentage * bar_length / 100))
    local empty=$((bar_length - filled))
    
    # Build bar
    local bar=""
    for ((i=0; i<filled; i++)); do bar="${bar}█"; done
    for ((i=0; i<empty; i++)); do bar="${bar}░"; done
    
    # State indicator
    local state_icon="⏳"
    case "$state" in
        "$JOB_STATE_JOB_COMPLETE")
            state_icon="✅"
            ;;
        "$JOB_STATE_FAILED"|"$JOB_STATE_ABORTED")
            state_icon="❌"
            ;;
        "$JOB_STATE_IN_PROGRESS")
            state_icon="🔄"
            ;;
    esac
    
    printf "\r%s [%s] %d%% | %d/%d records | %s    " \
        "$state_icon" "$bar" "$percentage" "$current" "$total" "$state"
}

# Monitor job until completion
monitor_job() {
    local job_id="$1"
    local start_time=$(date +%s)
    local last_state=""
    local poll_count=0
    
    log_message "INFO" "Starting job monitoring"
    
    while true; do
        # Check timeout
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -gt $MAX_WAIT ]; then
            log_message "ERROR" "Timeout reached after ${elapsed}s"
            
            if [ "$JSON_OUTPUT" = "true" ]; then
                echo "{\"error\": \"Timeout\", \"elapsed\": $elapsed, \"max_wait\": $MAX_WAIT}"
            fi
            
            return 2
        fi
        
        # Get job status
        local response=$(get_job_status "$job_id" "$JOB_TYPE")
        
        # Parse response
        eval $(parse_job_status "$response")
        
        # Log state change
        if [ "$STATE" != "$last_state" ]; then
            log_message "PROGRESS" "Job state: $STATE"
            last_state="$STATE"
        fi
        
        # Show progress
        show_progress "$RECORDS_PROCESSED" "$RECORDS_TOTAL" "$STATE"
        
        # Check completion states
        case "$STATE" in
            "$JOB_STATE_JOB_COMPLETE"|"JobComplete"|"Complete")
                # Calculate failure rate
                local failure_rate=0
                if [ "$RECORDS_PROCESSED" -gt 0 ]; then
                    failure_rate=$(echo "scale=4; $RECORDS_FAILED / $RECORDS_PROCESSED" | bc)
                fi
                
                # Check if within acceptable threshold
                if (( $(echo "$failure_rate <= $FAILURE_THRESHOLD" | bc -l) )); then
                    log_message "SUCCESS" "Job completed successfully"
                    log_message "INFO" "Processed: $RECORDS_PROCESSED, Failed: $RECORDS_FAILED"
                    
                    if [ "$JSON_OUTPUT" = "true" ]; then
                        echo "{
                            \"success\": true,
                            \"job_id\": \"$job_id\",
                            \"state\": \"$STATE\",
                            \"records_processed\": $RECORDS_PROCESSED,
                            \"records_failed\": $RECORDS_FAILED,
                            \"failure_rate\": $failure_rate,
                            \"elapsed_time\": $elapsed
                        }" | python3 -m json.tool
                    else
                        echo  # New line after progress bar
                        echo -e "${GREEN}✅ Job completed successfully${NC}"
                        echo "   Processed: $RECORDS_PROCESSED records"
                        echo "   Failed: $RECORDS_FAILED records"
                        echo "   Success rate: $(echo "scale=2; (1 - $failure_rate) * 100" | bc)%"
                    fi
                    
                    return 0
                else
                    log_message "ERROR" "Job completed but failure rate ($failure_rate) exceeds threshold ($FAILURE_THRESHOLD)"
                    
                    if [ "$JSON_OUTPUT" = "true" ]; then
                        echo "{
                            \"success\": false,
                            \"job_id\": \"$job_id\",
                            \"state\": \"$STATE\",
                            \"records_processed\": $RECORDS_PROCESSED,
                            \"records_failed\": $RECORDS_FAILED,
                            \"failure_rate\": $failure_rate,
                            \"error\": \"Failure rate exceeds threshold\"
                        }" | python3 -m json.tool
                    fi
                    
                    return 1
                fi
                ;;
                
            "$JOB_STATE_FAILED"|"Failed")
                log_message "ERROR" "Job failed: $ERROR_MESSAGE"
                
                if [ "$JSON_OUTPUT" = "true" ]; then
                    echo "{
                        \"success\": false,
                        \"job_id\": \"$job_id\",
                        \"state\": \"$STATE\",
                        \"error\": \"$ERROR_MESSAGE\",
                        \"elapsed_time\": $elapsed
                    }" | python3 -m json.tool
                else
                    echo  # New line after progress bar
                    echo -e "${RED}❌ Job failed${NC}"
                    echo "   Error: $ERROR_MESSAGE"
                fi
                
                return 1
                ;;
                
            "$JOB_STATE_ABORTED"|"Aborted")
                log_message "ERROR" "Job was aborted"
                
                if [ "$JSON_OUTPUT" = "true" ]; then
                    echo "{
                        \"success\": false,
                        \"job_id\": \"$job_id\",
                        \"state\": \"$STATE\",
                        \"error\": \"Job aborted\",
                        \"elapsed_time\": $elapsed
                    }" | python3 -m json.tool
                fi
                
                return 1
                ;;
                
            "ERROR")
                log_message "ERROR" "Failed to get job status: $ERROR_MESSAGE"
                
                # Retry a few times before giving up
                poll_count=$((poll_count + 1))
                if [ $poll_count -gt 5 ]; then
                    if [ "$JSON_OUTPUT" = "true" ]; then
                        echo "{\"error\": \"Failed to get job status\", \"message\": \"$ERROR_MESSAGE\"}"
                    fi
                    return 4
                fi
                ;;
        esac
        
        # Wait before next poll
        sleep "$POLL_INTERVAL"
        poll_count=$((poll_count + 1))
        
        # Log periodic status
        if [ $((poll_count % 12)) -eq 0 ]; then
            log_message "DEBUG" "Still monitoring... (${elapsed}s elapsed, $RECORDS_PROCESSED records processed)"
        fi
    done
}

# Main execution
main() {
    # Parse arguments
    ORG_ALIAS=""
    JOB_TYPE="ingest"
    POLL_INTERVAL=$DEFAULT_POLL_INTERVAL
    MAX_WAIT=$DEFAULT_MAX_WAIT
    FAILURE_THRESHOLD=$DEFAULT_FAILURE_THRESHOLD
    VERBOSE=false
    JSON_OUTPUT=false
    NO_COLOR=false
    SHOW_RAW=false
    JOB_ID=""
    
    while getopts "o:t:i:w:f:vjnrh" opt; do
        case $opt in
            o) ORG_ALIAS="$OPTARG" ;;
            t) JOB_TYPE="$OPTARG" ;;
            i) POLL_INTERVAL="$OPTARG" ;;
            w) MAX_WAIT="$OPTARG" ;;
            f) FAILURE_THRESHOLD=$(echo "scale=4; $OPTARG / 100" | bc) ;;
            v) VERBOSE=true ;;
            j) JSON_OUTPUT=true ;;
            n) NO_COLOR=true ;;
            r) SHOW_RAW=true ;;
            h) usage ;;
            *) usage ;;
        esac
    done
    
    shift $((OPTIND-1))
    
    # Get job ID
    JOB_ID="$1"
    
    if [ -z "$JOB_ID" ]; then
        echo -e "${RED}Error: Job ID required${NC}" >&2
        usage
    fi
    
    # Get org alias from environment if not provided
    if [ -z "$ORG_ALIAS" ]; then
        ORG_ALIAS="${SF_TARGET_ORG:-${SF_TARGET_ORG}}"
        
        if [ -z "$ORG_ALIAS" ]; then
            echo -e "${RED}Error: No org alias specified${NC}" >&2
            echo "Use -o flag or set SF_TARGET_ORG environment variable" >&2
            exit 3
        fi
    fi
    
    # Disable colors if requested
    if [ "$NO_COLOR" = "true" ]; then
        RED=""
        GREEN=""
        YELLOW=""
        BLUE=""
        CYAN=""
        MAGENTA=""
        NC=""
    fi
    
    # Start monitoring
    if [ "$JSON_OUTPUT" != "true" ]; then
        echo -e "${BLUE}Monitoring job: $JOB_ID${NC}"
        echo -e "${BLUE}Organization: $ORG_ALIAS${NC}"
        echo -e "${BLUE}Poll interval: ${POLL_INTERVAL}s${NC}"
        echo -e "${BLUE}Max wait time: ${MAX_WAIT}s${NC}"
        echo
    fi
    
    monitor_job "$JOB_ID"
    exit_code=$?
    
    # Final status
    if [ "$JSON_OUTPUT" != "true" ]; then
        echo
        case $exit_code in
            0)
                echo -e "${GREEN}Job monitoring completed successfully${NC}"
                ;;
            1)
                echo -e "${RED}Job failed or exceeded failure threshold${NC}"
                ;;
            2)
                echo -e "${YELLOW}Job monitoring timed out${NC}"
                ;;
            *)
                echo -e "${RED}Job monitoring encountered an error${NC}"
                ;;
        esac
    fi
    
    exit $exit_code
}

# Run main function
main "$@"
