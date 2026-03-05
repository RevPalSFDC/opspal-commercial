#!/bin/bash

################################################################################
# smart-retry.sh - Intelligent retry system with exponential backoff
################################################################################
# Implements smart retry logic with error categorization and circuit breaker
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
CONFIG_DIR="$SCRIPT_DIR/../config"
LOG_DIR="$SCRIPT_DIR/../logs/smart-retry"
STATE_DIR="$SCRIPT_DIR/../.state/retry"

# Create directories
mkdir -p "$CONFIG_DIR" "$LOG_DIR" "$STATE_DIR"

# Default retry configuration
DEFAULT_MAX_RETRIES=5
DEFAULT_BASE_DELAY=2
DEFAULT_MAX_DELAY=300
DEFAULT_MULTIPLIER=2
DEFAULT_JITTER=0.3

# Error categories with specific retry strategies
declare -A ERROR_CATEGORIES=(
    ["TIMEOUT"]=5           # Network timeouts - retry up to 5 times
    ["CONNECTION"]=4        # Connection errors - retry 4 times
    ["RATE_LIMIT"]=3        # API rate limits - retry 3 times with longer delays
    ["LOCK"]=3              # Row lock errors - retry 3 times
    ["MALFORMED"]=1         # Malformed data - retry once
    ["PERMISSION"]=0        # Permission errors - don't retry
    ["NOT_FOUND"]=0         # Resource not found - don't retry
    ["VALIDATION"]=0        # Validation errors - don't retry
)

# Error patterns for categorization
declare -A ERROR_PATTERNS=(
    ["TIMEOUT"]="timeout|timed out|TimeoutError|ETIMEDOUT"
    ["CONNECTION"]="connection|refused|ECONNREFUSED|ENOTFOUND|getaddrinfo"
    ["RATE_LIMIT"]="rate limit|too many requests|429|RATE_EXCEEDED"
    ["LOCK"]="UNABLE_TO_LOCK_ROW|lock|deadlock|concurrent"
    ["MALFORMED"]="malformed|invalid json|parse error|JSONDecodeError"
    ["PERMISSION"]="permission|unauthorized|forbidden|401|403|INSUFFICIENT_ACCESS"
    ["NOT_FOUND"]="not found|404|does not exist|INVALID_FIELD"
    ["VALIDATION"]="validation|FIELD_CUSTOM_VALIDATION|REQUIRED_FIELD_MISSING"
)

# Circuit breaker state
CIRCUIT_BREAKER_FILE="$STATE_DIR/circuit_breaker.state"
CIRCUIT_BREAKER_THRESHOLD=10
CIRCUIT_BREAKER_TIMEOUT=300  # 5 minutes

usage() {
    cat << EOF
Usage: $0 [OPTIONS] COMMAND

Smart retry system with exponential backoff and error categorization.

OPTIONS:
    -r MAX        Maximum retry attempts (default: $DEFAULT_MAX_RETRIES)
    -d DELAY      Base delay in seconds (default: $DEFAULT_BASE_DELAY)
    -m MULTIPLIER Backoff multiplier (default: $DEFAULT_MULTIPLIER)
    -x MAX_DELAY  Maximum delay in seconds (default: $DEFAULT_MAX_DELAY)
    -j JITTER     Jitter factor 0-1 (default: $DEFAULT_JITTER)
    -c CATEGORY   Force error category (for testing)
    -s            Silent mode (suppress progress output)
    -v            Verbose mode (show detailed logs)
    -b            Bypass circuit breaker
    -h            Display this help

COMMAND:
    The command to execute with retry logic

EXAMPLES:
    # Basic retry
    $0 "sf data query --query 'SELECT Id FROM Account'"
    
    # Custom retry configuration
    $0 -r 10 -d 5 -m 3 "sf data import bulk --file large.csv"
    
    # Verbose mode for debugging
    $0 -v "sf project deploy start --source-dir force-app"

ERROR CATEGORIES:
EOF
    for category in "${!ERROR_CATEGORIES[@]}"; do
        printf "    %-15s: Max retries = %d\n" "$category" "${ERROR_CATEGORIES[$category]}"
    done
    echo
    exit 0
}

# Logging function
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    local log_file="$LOG_DIR/retry-$(date +%Y%m%d).log"
    
    echo "[$timestamp] [$level] $message" >> "$log_file"
    
    if [ "$SILENT" != "true" ]; then
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
            RETRY)
                echo -e "${CYAN}🔄 $message${NC}"
                ;;
            DEBUG)
                [ "$VERBOSE" = "true" ] && echo -e "${MAGENTA}🔍 $message${NC}"
                ;;
        esac
    fi
}

# Categorize error based on patterns
categorize_error() {
    local error_text="$1"
    
    for category in "${!ERROR_PATTERNS[@]}"; do
        if echo "$error_text" | grep -iE "${ERROR_PATTERNS[$category]}" > /dev/null 2>&1; then
            echo "$category"
            return
        fi
    done
    
    echo "UNKNOWN"
}

# Calculate delay with exponential backoff and jitter
calculate_delay() {
    local attempt=$1
    local base_delay=$2
    local multiplier=$3
    local max_delay=$4
    local jitter=$5
    
    # Exponential backoff
    local delay=$(echo "$base_delay * ($multiplier ^ ($attempt - 1))" | bc -l)
    
    # Cap at max delay
    if (( $(echo "$delay > $max_delay" | bc -l) )); then
        delay=$max_delay
    fi
    
    # Add jitter
    if (( $(echo "$jitter > 0" | bc -l) )); then
        local jitter_amount=$(echo "$delay * $jitter * ($(shuf -i 0-100 -n 1) / 100)" | bc -l)
        delay=$(echo "$delay + $jitter_amount - ($delay * $jitter / 2)" | bc -l)
    fi
    
    # Round to integer
    printf "%.0f" "$delay"
}

# Circuit breaker check
check_circuit_breaker() {
    if [ "$BYPASS_CIRCUIT" = "true" ]; then
        return 0
    fi
    
    if [ -f "$CIRCUIT_BREAKER_FILE" ]; then
        local state=$(cat "$CIRCUIT_BREAKER_FILE")
        local failures=$(echo "$state" | cut -d':' -f1)
        local last_failure=$(echo "$state" | cut -d':' -f2)
        local current_time=$(date +%s)
        
        # Check if circuit should reset
        if [ $((current_time - last_failure)) -gt $CIRCUIT_BREAKER_TIMEOUT ]; then
            log_message "INFO" "Circuit breaker reset after timeout"
            rm -f "$CIRCUIT_BREAKER_FILE"
            return 0
        fi
        
        # Check if circuit is open
        if [ "$failures" -ge "$CIRCUIT_BREAKER_THRESHOLD" ]; then
            log_message "ERROR" "Circuit breaker OPEN - too many failures ($failures)"
            return 1
        fi
    fi
    
    return 0
}

# Update circuit breaker state
update_circuit_breaker() {
    local success=$1
    
    if [ "$BYPASS_CIRCUIT" = "true" ]; then
        return
    fi
    
    if [ "$success" = "true" ]; then
        # Reset on success
        rm -f "$CIRCUIT_BREAKER_FILE"
    else
        # Increment failure count
        local failures=1
        if [ -f "$CIRCUIT_BREAKER_FILE" ]; then
            failures=$(($(cat "$CIRCUIT_BREAKER_FILE" | cut -d':' -f1) + 1))
        fi
        echo "$failures:$(date +%s)" > "$CIRCUIT_BREAKER_FILE"
        
        if [ "$failures" -ge "$CIRCUIT_BREAKER_THRESHOLD" ]; then
            log_message "WARNING" "Circuit breaker triggered after $failures failures"
        fi
    fi
}

# Execute command with retry logic
execute_with_retry() {
    local command="$1"
    local max_retries=$2
    local base_delay=$3
    local multiplier=$4
    local max_delay=$5
    local jitter=$6
    
    local attempt=1
    local exit_code=0
    local output_file="$LOG_DIR/output-$$-$(date +%s).tmp"
    local error_file="$LOG_DIR/error-$$-$(date +%s).tmp"
    
    # Check circuit breaker
    if ! check_circuit_breaker; then
        log_message "ERROR" "Circuit breaker is OPEN - refusing to execute"
        return 1
    fi
    
    while [ $attempt -le $max_retries ]; do
        log_message "INFO" "Attempt $attempt/$max_retries"
        
        # Execute command
        if bash -c "$command" > "$output_file" 2> "$error_file"; then
            exit_code=0
            cat "$output_file"
            log_message "SUCCESS" "Command succeeded on attempt $attempt"
            update_circuit_breaker true
            break
        else
            exit_code=$?
            error_text=$(cat "$error_file")
            
            # Categorize error
            error_category=$(categorize_error "$error_text")
            category_max_retries=${ERROR_CATEGORIES[$error_category]:-$max_retries}
            
            log_message "DEBUG" "Error category: $error_category (max retries: $category_max_retries)"
            
            # Check if we should retry based on category
            if [ "$category_max_retries" -eq 0 ]; then
                log_message "ERROR" "Error category '$error_category' is not retryable"
                cat "$error_file" >&2
                update_circuit_breaker false
                break
            fi
            
            # Check if we've exceeded category-specific retry limit
            if [ $attempt -ge $category_max_retries ]; then
                log_message "ERROR" "Exceeded retry limit for category '$error_category'"
                cat "$error_file" >&2
                update_circuit_breaker false
                break
            fi
            
            # Check if we've exceeded global retry limit
            if [ $attempt -ge $max_retries ]; then
                log_message "ERROR" "Maximum retry attempts reached"
                cat "$error_file" >&2
                update_circuit_breaker false
                break
            fi
            
            # Calculate delay
            delay=$(calculate_delay $attempt $base_delay $multiplier $max_delay $jitter)
            
            # Special handling for rate limits (longer delay)
            if [ "$error_category" = "RATE_LIMIT" ]; then
                delay=$((delay * 3))
                log_message "INFO" "Rate limit detected - using extended delay"
            fi
            
            log_message "RETRY" "Retrying in ${delay}s (error: $error_category)"
            
            # Show countdown if verbose
            if [ "$VERBOSE" = "true" ] && [ "$SILENT" != "true" ]; then
                for ((i=delay; i>0; i--)); do
                    echo -ne "\r${CYAN}Waiting: ${i}s ${NC}"
                    sleep 1
                done
                echo -ne "\r                    \r"
            else
                sleep "$delay"
            fi
            
            attempt=$((attempt + 1))
        fi
    done
    
    # Cleanup
    rm -f "$output_file" "$error_file"
    
    return $exit_code
}

# Show retry statistics
show_statistics() {
    local log_file="$LOG_DIR/retry-$(date +%Y%m%d).log"
    
    if [ -f "$log_file" ]; then
        echo -e "\n${BLUE}=== Retry Statistics ===${NC}"
        
        local total=$(grep -c "Attempt" "$log_file" 2>/dev/null || echo 0)
        local success=$(grep -c "SUCCESS" "$log_file" 2>/dev/null || echo 0)
        local failures=$(grep -c "ERROR" "$log_file" 2>/dev/null || echo 0)
        
        echo "Total attempts: $total"
        echo "Successful: $success"
        echo "Failed: $failures"
        
        echo -e "\n${BLUE}Error Categories:${NC}"
        for category in "${!ERROR_CATEGORIES[@]}"; do
            local count=$(grep -c "error: $category" "$log_file" 2>/dev/null || echo 0)
            [ $count -gt 0 ] && echo "  $category: $count"
        done
    fi
}

# Main execution
main() {
    local max_retries=$DEFAULT_MAX_RETRIES
    local base_delay=$DEFAULT_BASE_DELAY
    local multiplier=$DEFAULT_MULTIPLIER
    local max_delay=$DEFAULT_MAX_DELAY
    local jitter=$DEFAULT_JITTER
    local forced_category=""
    SILENT=false
    VERBOSE=false
    BYPASS_CIRCUIT=false
    
    # Parse options
    while getopts "r:d:m:x:j:c:svbh" opt; do
        case $opt in
            r) max_retries="$OPTARG" ;;
            d) base_delay="$OPTARG" ;;
            m) multiplier="$OPTARG" ;;
            x) max_delay="$OPTARG" ;;
            j) jitter="$OPTARG" ;;
            c) forced_category="$OPTARG" ;;
            s) SILENT=true ;;
            v) VERBOSE=true ;;
            b) BYPASS_CIRCUIT=true ;;
            h) usage ;;
            *) usage ;;
        esac
    done
    
    shift $((OPTIND-1))
    
    # Get command
    local command="$*"
    
    if [ -z "$command" ]; then
        echo -e "${RED}Error: No command specified${NC}" >&2
        usage
    fi
    
    # Override category if forced
    if [ -n "$forced_category" ]; then
        max_retries=${ERROR_CATEGORIES[$forced_category]:-$max_retries}
        log_message "INFO" "Forcing error category: $forced_category (max retries: $max_retries)"
    fi
    
    # Execute with retry
    execute_with_retry "$command" "$max_retries" "$base_delay" "$multiplier" "$max_delay" "$jitter"
    exit_code=$?
    
    # Show statistics in verbose mode
    [ "$VERBOSE" = "true" ] && show_statistics
    
    exit $exit_code
}

# Run main function
main "$@"