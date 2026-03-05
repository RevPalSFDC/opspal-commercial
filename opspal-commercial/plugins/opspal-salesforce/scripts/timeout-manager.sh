#!/bin/bash

################################################################################
# timeout-manager.sh - Intelligent Timeout Management for Salesforce Operations
################################################################################
# Provides configurable timeout profiles for different operation types
# with automatic adjustment based on data volume and operation history
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$SCRIPT_DIR/../config"
LOG_DIR="$SCRIPT_DIR/../logs/timeout-manager"

# Create necessary directories
mkdir -p "$CONFIG_DIR" "$LOG_DIR"

# Load environment configuration
ENV_FILE="$CONFIG_DIR/.env.timeout"
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
fi

# Timeout profiles (in seconds)
declare -A TIMEOUT_PROFILES=(
    ["quick"]=30          # Quick queries, simple operations
    ["standard"]=300      # Standard operations (5 min)
    ["extended"]=600      # Extended operations (10 min)
    ["bulk"]=1800        # Bulk operations (30 min)
    ["large"]=3600       # Large datasets (1 hour)
    ["migration"]=7200   # Data migrations (2 hours)
    ["unlimited"]=0      # No timeout (use with caution)
)

# Operation type mappings
declare -A OPERATION_TIMEOUTS=(
    ["query"]=300
    ["insert"]=600
    ["update"]=600
    ["upsert"]=900
    ["delete"]=600
    ["deploy"]=1800
    ["retrieve"]=1200
    ["export"]=1800
    ["import"]=3600
    ["package"]=1800
)

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] COMMAND

Intelligent timeout management for Salesforce operations.

OPTIONS:
    -p PROFILE      Timeout profile (quick|standard|extended|bulk|large|migration|unlimited)
    -t TIMEOUT      Custom timeout in seconds
    -o OPERATION    Operation type (query|insert|update|upsert|delete|deploy|etc.)
    -r RECORDS      Number of records (auto-adjusts timeout)
    -a              Auto-detect optimal timeout
    -i              Interactive mode
    -m              Monitor mode (shows progress)
    -l              List available profiles
    -h              Display this help

COMMAND:
    The command to execute with timeout management

EXAMPLES:
    # Use standard profile
    $0 -p standard "sf data query --query 'SELECT Id FROM Account'"
    
    # Auto-detect based on operation
    $0 -o query -a "sf data query --query 'SELECT Id FROM Account'"
    
    # Custom timeout for large dataset
    $0 -t 3600 -r 50000 "sf data upsert bulk --sobject Account --file accounts.csv"
    
    # Monitor long-running operation
    $0 -p migration -m "sf project deploy start --source-dir force-app"

PROFILES:
$(for profile in "${!TIMEOUT_PROFILES[@]}"; do
    printf "    %-12s: %s seconds\n" "$profile" "${TIMEOUT_PROFILES[$profile]}"
done | sort)

EOF
    exit 0
}

# Function to log messages
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    local log_file="$LOG_DIR/timeout-$(date +%Y%m%d).log"
    
    echo "[$timestamp] [$level] $message" >> "$log_file"
    
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
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        PROGRESS)
            echo -e "${CYAN}⏳ $message${NC}"
            ;;
    esac
}

# Function to calculate timeout based on record count
# Enhanced to use Node.js estimator if available for more accurate estimates
calculate_timeout_for_records() {
    local records="$1"
    local operation="${2:-upsert}"
    local has_triggers="${3:-false}"
    local has_validation_rules="${4:-false}"
    local has_flows="${5:-false}"

    # Try using the Node.js estimator for more accurate calculation
    local estimator="$SCRIPT_DIR/lib/timeout-estimator.js"
    if [ -f "$estimator" ] && command -v node &> /dev/null; then
        local flags=""
        [ "$has_triggers" = "true" ] && flags="$flags --triggers"
        [ "$has_validation_rules" = "true" ] && flags="$flags --validation-rules"
        [ "$has_flows" = "true" ] && flags="$flags --flows"

        local result=$(node "$estimator" "$records" "$operation" $flags --quiet 2>/dev/null)
        if [ -n "$result" ] && [ "$result" -gt 0 ]; then
            echo "$result"
            return
        fi
    fi

    # Fallback to shell calculation
    local base_timeout="${OPERATION_TIMEOUTS[$operation]:-300}"

    # Enhanced calculation with complexity multipliers
    local multiplier=1
    [ "$has_triggers" = "true" ] && multiplier=$((multiplier * 18 / 10))
    [ "$has_validation_rules" = "true" ] && multiplier=$((multiplier * 14 / 10))
    [ "$has_flows" = "true" ] && multiplier=$((multiplier * 16 / 10))

    # Calculate: base + (records * base_time_ms * multiplier / 1000) + network_overhead
    local base_time_ms=50  # Default 50ms per record
    case "$operation" in
        query) base_time_ms=5 ;;
        insert) base_time_ms=40 ;;
        update) base_time_ms=50 ;;
        upsert) base_time_ms=60 ;;
        delete) base_time_ms=30 ;;
        deploy) base_time_ms=100 ;;
    esac

    local processing_time=$((records * base_time_ms * multiplier / 1000))
    local batch_overhead=$((records / 200 + 1))  # 1 second per batch
    local calculated=$((base_timeout + processing_time + batch_overhead))

    # Apply 20% safety margin
    calculated=$((calculated * 12 / 10))

    # Bounds: min 30s, max 2 hours
    [ $calculated -lt 30 ] && calculated=30
    [ $calculated -gt 7200 ] && calculated=7200

    echo "$calculated"
}

# Function to auto-select timeout profile based on record count
# Returns the recommended profile name
auto_select_profile() {
    local records="$1"
    local operation="${2:-upsert}"

    if [ $records -gt 50000 ]; then
        echo "migration"
    elif [ $records -gt 10000 ]; then
        echo "large"
    elif [ $records -gt 2000 ]; then
        echo "bulk"
    elif [ $records -gt 500 ]; then
        echo "extended"
    elif [ $records -gt 100 ]; then
        echo "standard"
    else
        echo "quick"
    fi
}

# Function to display timeout estimation with recommendations
estimate_and_display() {
    local records="$1"
    local operation="${2:-upsert}"
    local has_triggers="${3:-false}"
    local has_validation_rules="${4:-false}"
    local has_flows="${5:-false}"

    local estimated=$(calculate_timeout_for_records "$records" "$operation" "$has_triggers" "$has_validation_rules" "$has_flows")
    local profile=$(auto_select_profile "$records" "$operation")
    local profile_timeout="${TIMEOUT_PROFILES[$profile]}"
    local recommended=$estimated
    [ $profile_timeout -gt $estimated ] && recommended=$profile_timeout

    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  TIMEOUT ESTIMATION${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Records:       ${YELLOW}$(printf "%'d" $records)${NC}"
    echo -e "  Operation:     ${YELLOW}$operation${NC}"
    echo -e "  Profile:       ${YELLOW}$profile${NC}"
    echo ""
    echo -e "  Estimated:     ${GREEN}${estimated}s${NC}"
    echo -e "  Recommended:   ${GREEN}${recommended}s${NC} ($profile profile)"
    echo ""

    # Warnings
    if [ $estimated -gt 600 ]; then
        echo -e "  ${YELLOW}⚠️  WARNING: May exceed 10-minute CLI default timeout${NC}"
        echo -e "  ${YELLOW}   Use: --wait $((recommended / 60 + 1)) or background execution${NC}"
        echo ""
    fi

    if [ $records -gt 10000 ]; then
        echo -e "  ${BLUE}ℹ️  Consider using Bulk API 2.0 for large datasets${NC}"
        echo ""
    fi

    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Return the recommended timeout
    echo "$recommended"
}

# Function to detect optimal timeout
auto_detect_timeout() {
    local command="$1"
    local timeout=300  # Default
    
    # Check for bulk operations
    if echo "$command" | grep -q "bulk\|import\|export"; then
        timeout="${TIMEOUT_PROFILES[bulk]}"
        log_message "INFO" "Detected bulk operation, using timeout: ${timeout}s"
    # Check for deployment
    elif echo "$command" | grep -q "deploy\|retrieve"; then
        timeout="${TIMEOUT_PROFILES[extended]}"
        log_message "INFO" "Detected deployment operation, using timeout: ${timeout}s"
    # Check for query
    elif echo "$command" | grep -q "query\|soql"; then
        timeout="${TIMEOUT_PROFILES[standard]}"
        log_message "INFO" "Detected query operation, using timeout: ${timeout}s"
    fi
    
    echo "$timeout"
}

# Function to execute with timeout
execute_with_timeout() {
    local timeout="$1"
    local command="$2"
    local monitor="$3"
    
    log_message "INFO" "Executing command with ${timeout}s timeout"
    log_message "INFO" "Command: $command"
    
    local start_time=$(date +%s)
    local output_file="$LOG_DIR/output-$$-$(date +%s).log"
    local error_file="$LOG_DIR/error-$$-$(date +%s).log"
    
    if [ "$timeout" -eq 0 ]; then
        # No timeout
        log_message "WARNING" "Running without timeout limit"
        if [ "$monitor" = "true" ]; then
            # Run with monitoring
            bash -c "$command" 2>&1 | while IFS= read -r line; do
                echo "$line"
                echo "$line" >> "$output_file"
            done
            local exit_code="${PIPESTATUS[0]}"
        else
            bash -c "$command" > "$output_file" 2> "$error_file"
            local exit_code=$?
            cat "$output_file"
        fi
    else
        # With timeout
        if [ "$monitor" = "true" ]; then
            # Run with monitoring and timeout
            timeout --preserve-status "$timeout" bash -c "$command" 2>&1 | while IFS= read -r line; do
                echo "$line"
                echo "$line" >> "$output_file"
                
                # Show progress indicator
                local current_time=$(date +%s)
                local elapsed=$((current_time - start_time))
                if [ $((elapsed % 10)) -eq 0 ]; then
                    log_message "PROGRESS" "Running for ${elapsed}s / ${timeout}s"
                fi
            done
            local exit_code="${PIPESTATUS[0]}"
        else
            timeout --preserve-status "$timeout" bash -c "$command" > "$output_file" 2> "$error_file"
            local exit_code=$?
            cat "$output_file"
        fi
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Check exit code
    if [ $exit_code -eq 124 ]; then
        log_message "ERROR" "Command timed out after ${timeout}s"
        log_message "INFO" "Consider using a longer timeout or the 'bulk' profile"
        
        # Save partial output
        if [ -s "$output_file" ]; then
            log_message "INFO" "Partial output saved to: $output_file"
        fi
        
        return 124
    elif [ $exit_code -eq 0 ]; then
        log_message "SUCCESS" "Command completed successfully in ${duration}s"
        
        # Suggest optimization if much faster than timeout
        if [ $duration -lt $((timeout / 3)) ] && [ $timeout -gt 60 ]; then
            log_message "INFO" "Consider using a shorter timeout (operation took only ${duration}s)"
        fi
    else
        log_message "ERROR" "Command failed with exit code: $exit_code"
        if [ -s "$error_file" ]; then
            echo -e "${RED}Error output:${NC}" >&2
            cat "$error_file" >&2
        fi
    fi
    
    # Cleanup if successful and not monitoring
    if [ $exit_code -eq 0 ] && [ "$monitor" != "true" ]; then
        rm -f "$output_file" "$error_file"
    fi
    
    return $exit_code
}

# Function to list profiles
list_profiles() {
    echo -e "${BLUE}Available Timeout Profiles:${NC}"
    echo
    printf "%-15s %-15s %s\n" "Profile" "Timeout" "Use Case"
    printf "%-15s %-15s %s\n" "-------" "-------" "--------"
    printf "%-15s %-15s %s\n" "quick" "30s" "Simple queries, field updates"
    printf "%-15s %-15s %s\n" "standard" "5 min" "Standard CRUD operations"
    printf "%-15s %-15s %s\n" "extended" "10 min" "Complex queries, small deployments"
    printf "%-15s %-15s %s\n" "bulk" "30 min" "Bulk data operations"
    printf "%-15s %-15s %s\n" "large" "1 hour" "Large dataset processing"
    printf "%-15s %-15s %s\n" "migration" "2 hours" "Full data migrations"
    printf "%-15s %-15s %s\n" "unlimited" "none" "No timeout (use carefully)"
    echo
    echo -e "${YELLOW}Tip: Use -a flag for auto-detection based on operation type${NC}"
}

# Main execution
main() {
    local profile=""
    local custom_timeout=""
    local operation=""
    local records=""
    local auto_detect=false
    local interactive=false
    local monitor=false
    local timeout=300  # Default 5 minutes
    
    # Parse arguments
    while getopts "p:t:o:r:aimlh" opt; do
        case $opt in
            p) profile="$OPTARG" ;;
            t) custom_timeout="$OPTARG" ;;
            o) operation="$OPTARG" ;;
            r) records="$OPTARG" ;;
            a) auto_detect=true ;;
            i) interactive=true ;;
            m) monitor=true ;;
            l) list_profiles; exit 0 ;;
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
    
    # Determine timeout
    if [ -n "$custom_timeout" ]; then
        timeout="$custom_timeout"
        log_message "INFO" "Using custom timeout: ${timeout}s"
    elif [ -n "$profile" ]; then
        if [ -z "${TIMEOUT_PROFILES[$profile]}" ]; then
            log_message "ERROR" "Invalid profile: $profile"
            list_profiles
            exit 1
        fi
        timeout="${TIMEOUT_PROFILES[$profile]}"
        log_message "INFO" "Using profile '$profile' with timeout: ${timeout}s"
    elif [ -n "$records" ]; then
        timeout=$(calculate_timeout_for_records "$records" "$operation")
        log_message "INFO" "Calculated timeout for $records records: ${timeout}s"
    elif [ "$auto_detect" = true ]; then
        timeout=$(auto_detect_timeout "$command")
    elif [ -n "$operation" ]; then
        timeout="${OPERATION_TIMEOUTS[$operation]:-300}"
        log_message "INFO" "Using timeout for operation '$operation': ${timeout}s"
    fi
    
    # Interactive mode
    if [ "$interactive" = true ]; then
        echo -e "${CYAN}Timeout Manager - Interactive Mode${NC}"
        echo "Command: $command"
        echo "Proposed timeout: ${timeout}s"
        read -p "Accept timeout? (y/n/custom): " response
        
        case "$response" in
            n|N)
                list_profiles
                read -p "Select profile: " profile
                timeout="${TIMEOUT_PROFILES[$profile]}"
                ;;
            custom|c|C)
                read -p "Enter timeout in seconds: " timeout
                ;;
        esac
    fi
    
    # Execute command with timeout
    execute_with_timeout "$timeout" "$command" "$monitor"
    exit_code=$?
    
    # Handle timeout retry
    if [ $exit_code -eq 124 ]; then
        echo
        read -p "Command timed out. Retry with longer timeout? (y/n): " retry
        if [ "$retry" = "y" ] || [ "$retry" = "Y" ]; then
            new_timeout=$((timeout * 2))
            log_message "INFO" "Retrying with doubled timeout: ${new_timeout}s"
            execute_with_timeout "$new_timeout" "$command" "$monitor"
            exit_code=$?
        fi
    fi
    
    exit $exit_code
}

# Run main function
main "$@"