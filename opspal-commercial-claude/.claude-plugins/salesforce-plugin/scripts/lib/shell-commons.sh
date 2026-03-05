#!/bin/bash
# shell-commons.sh
# Common shell utilities for Salesforce script optimization
# Version: 1.0.0
# Usage: source "$(dirname "$0")/lib/shell-commons.sh"

# Prevent multiple sourcing
if [[ "${SHELL_COMMONS_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SHELL_COMMONS_LOADED=true

# =============================================================================
# COLOR CODES AND FORMATTING
# =============================================================================

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly GRAY='\033[0;90m'
readonly NC='\033[0m' # No Color

# Text formatting
readonly BOLD='\033[1m'
readonly UNDERLINE='\033[4m'
readonly REVERSE='\033[7m'
readonly RESET='\033[0m'

# Status symbols
readonly SUCCESS_SYMBOL="✓"
readonly ERROR_SYMBOL="✗"
readonly WARNING_SYMBOL="⚠"
readonly INFO_SYMBOL="ℹ"
readonly PROGRESS_SYMBOL="➤"

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

# Get timestamp for logging
get_timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

# Log info message
log_info() {
    local message="$1"
    echo -e "${CYAN}${INFO_SYMBOL}${NC} ${GRAY}[$(get_timestamp)]${NC} ${message}" >&1
}

# Log success message
log_success() {
    local message="$1"
    echo -e "${GREEN}${SUCCESS_SYMBOL}${NC} ${GRAY}[$(get_timestamp)]${NC} ${GREEN}${message}${NC}" >&1
}

# Log warning message
log_warning() {
    local message="$1"
    echo -e "${YELLOW}${WARNING_SYMBOL}${NC} ${GRAY}[$(get_timestamp)]${NC} ${YELLOW}WARNING: ${message}${NC}" >&2
}

# Log error message
log_error() {
    local message="$1"
    echo -e "${RED}${ERROR_SYMBOL}${NC} ${GRAY}[$(get_timestamp)]${NC} ${RED}ERROR: ${message}${NC}" >&2
}

# Log debug message (only if DEBUG=true)
log_debug() {
    local message="$1"
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${PURPLE}[DEBUG]${NC} ${GRAY}[$(get_timestamp)]${NC} ${message}" >&2
    fi
}

# Log with custom level
log_custom() {
    local level="$1"
    local message="$2"
    local color="$3"
    echo -e "${color}[${level}]${NC} ${GRAY}[$(get_timestamp)]${NC} ${message}" >&1
}

# =============================================================================
# ERROR HANDLING UTILITIES
# =============================================================================

# Set up error handling for script
setup_error_handling() {
    set -eE  # Exit on error, including in functions
    trap 'handle_script_error $? $LINENO' ERR
    trap 'cleanup_on_exit' EXIT
}

# Handle script errors
handle_script_error() {
    local exit_code=$1
    local line_number=$2
    log_error "Script failed at line ${line_number} with exit code ${exit_code}"
    
    # Show call stack if available
    if declare -f | grep -q "BASH_SOURCE\|FUNCNAME"; then
        log_error "Call stack:"
        local i=0
        while [[ -n "${FUNCNAME[i]:-}" ]]; do
            echo -e "${RED}  ${i}: ${FUNCNAME[i]} (${BASH_SOURCE[i]:-unknown}:${BASH_LINENO[i]:-0})${NC}" >&2
            ((i++))
        done
    fi
}

# Generic error handler
handle_error() {
    local exit_code=$1
    local message="${2:-Command failed}"
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "${message} (exit code: ${exit_code})"
        return $exit_code
    fi
    return 0
}

# Retry function with exponential backoff
retry_with_backoff() {
    local max_attempts="${1:-3}"
    local delay="${2:-1}"
    local multiplier="${3:-2}"
    local command=("${@:4}")
    
    local attempt=1
    local current_delay=$delay
    
    while [[ $attempt -le $max_attempts ]]; do
        log_debug "Attempt ${attempt}/${max_attempts}: ${command[*]}"
        
        if "${command[@]}"; then
            log_success "Command succeeded on attempt ${attempt}"
            return 0
        fi
        
        local exit_code=$?
        
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Command failed after ${max_attempts} attempts"
            return $exit_code
        fi
        
        log_warning "Attempt ${attempt} failed, retrying in ${current_delay}s..."
        sleep $current_delay
        
        ((attempt++))
        current_delay=$((current_delay * multiplier))
    done
}

# Cleanup function for exit trap
cleanup_on_exit() {
    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        log_debug "Script completed successfully"
    else
        log_error "Script exited with code ${exit_code}"
    fi
    return $exit_code
}

# =============================================================================
# SALESFORCE CLI WRAPPERS
# =============================================================================

# Guard against legacy SFDX environment variables
guard_legacy_env() {
    local legacy_vars=()
    local candidates=("SFDX_ALIAS" "SFDX_DEFAULT_USERNAME" "SFDX_DEFAULTUSERNAME" "SFDX_AUTH_URL")

    for var in "${candidates[@]}"; do
        if [[ -n "${!var:-}" ]]; then
            legacy_vars+=("$var")
        fi
    done

    if [[ ${#legacy_vars[@]} -gt 0 ]]; then
        log_error "Legacy Salesforce DX env vars detected: ${legacy_vars[*]}. Use SF_TARGET_ORG or sf config instead."
        return 1
    fi

    return 0
}

# Get Salesforce CLI executable
get_sf_cli() {
    guard_legacy_env || return 1

    if command -v sf >/dev/null 2>&1; then
        echo "sf"
    elif command -v sfdx >/dev/null 2>&1; then
        log_error "Legacy sfdx CLI detected but not supported. Install Salesforce CLI (sf) v2.x."
        return 1
    else
        log_error "Salesforce CLI (sf) not found. Please install Salesforce CLI."
        return 1
    fi
}

# Safe Salesforce query with error handling
safe_sf_query() {
    local query="$1"
    local org_alias="${2:-}"
    local format="${3:-json}"
    
    local sf_cli
    sf_cli=$(get_sf_cli) || return 1
    
    local cmd=("$sf_cli" "data" "query" "--query" "$query")

    # Heuristic: Add --use-tooling-api when querying Tooling objects
    local upper
    upper=$(echo "$query" | tr '[:lower:]' '[:upper:]')
    if [[ "$upper" == *" FROM "* ]]; then
        # Extract the first token after FROM (ignoring simple subselects)
        local from_part
        from_part=${upper#* FROM }
        # strip simple subselects () to improve detection
        while [[ "$from_part" == *"("* && "$from_part" == *")"* ]]; do
            local s e
            s=$(expr index "$from_part" "(")
            e=$(expr index "$from_part" ")")
            if [[ $e -le $s || $e -eq 0 ]]; then break; fi
            from_part="${from_part:0:$((s-1))}${from_part:$e}"
        done
        local first_token
        first_token=$(echo "$from_part" | awk '{print $1}')
        case "$first_token" in
            FLOW|FLOWDEFINITION|FLOWDEFINITIONVIEW|VALIDATIONRULE|FLEXIPAGE|LAYOUT|FIELDDEFINITION|ENTITYDEFINITION|APEXCLASS|APEXTRIGGER|APEXTESTQUEUEITEM|APEXCODECOVERAGE|APEXCODECOVERAGEAGGREGATE)
                cmd+=("--use-tooling-api")
                ;;
        esac
    fi
    
    if [[ -n "$org_alias" ]]; then
        cmd+=("--target-org" "$org_alias")
    fi
    
    if [[ "$format" == "json" ]]; then
        cmd+=("--json")
    elif [[ "$format" == "csv" ]]; then
        cmd+=("--result-format" "csv")
    fi
    
    log_debug "Executing: ${cmd[*]}"
    
    if ! "${cmd[@]}"; then
        log_error "SOQL query failed: $query"
        return 1
    fi
}

# Safe Salesforce deployment
safe_sf_deploy() {
    local source_path="$1"
    local org_alias="${2:-}"
    local check_only="${3:-false}"
    
    local sf_cli
    sf_cli=$(get_sf_cli) || return 1
    
    local cmd=("$sf_cli" "project" "deploy" "start")
    
    if [[ -d "$source_path" ]]; then
        cmd+=("--source-dir" "$source_path")
    elif [[ -f "$source_path" ]]; then
        cmd+=("--metadata-dir" "$source_path")
    else
        log_error "Source path does not exist: $source_path"
        return 1
    fi
    
    if [[ -n "$org_alias" ]]; then
        cmd+=("--target-org" "$org_alias")
    fi
    
    if [[ "$check_only" == "true" ]]; then
        cmd+=("--dry-run")
    fi
    
    log_debug "Executing: ${cmd[*]}"
    
    if ! "${cmd[@]}"; then
        log_error "Deployment failed for: $source_path"
        return 1
    fi
}

# Get org information
get_org_info() {
    local org_alias="${1:-}"
    local sf_cli
    sf_cli=$(get_sf_cli) || return 1
    
    local cmd=("$sf_cli" "org" "display" "--json")
    
    if [[ -n "$org_alias" ]]; then
        cmd+=("--target-org" "$org_alias")
    fi
    
    if ! "${cmd[@]}"; then
        log_error "Failed to get org information"
        return 1
    fi
}

# =============================================================================
# CONFIGURATION MANAGEMENT
# =============================================================================

# Load configuration from file
load_config() {
    local config_file="$1"
    local required="${2:-true}"
    
    if [[ ! -f "$config_file" ]]; then
        if [[ "$required" == "true" ]]; then
            log_error "Configuration file not found: $config_file"
            return 1
        else
            log_warning "Configuration file not found: $config_file (optional)"
            return 0
        fi
    fi
    
    log_debug "Loading configuration from: $config_file"
    
    # Source the config file safely
    if [[ "$config_file" =~ \.sh$ ]]; then
        # shellcheck source=/dev/null
        source "$config_file"
    elif [[ "$config_file" =~ \.(env|conf)$ ]]; then
        # Load key=value pairs
        set -o allexport
        # shellcheck source=/dev/null
        source "$config_file"
        set +o allexport
    else
        log_warning "Unknown configuration file format: $config_file"
        return 1
    fi
    
    log_success "Configuration loaded successfully"
}

# Get org alias from various sources
get_org_alias() {
    local default_alias="$1"

    guard_legacy_env || return 1
    
    # Priority order: command line arg, environment variable, default
    if [[ -n "${ORG_ALIAS:-}" ]]; then
        echo "$ORG_ALIAS"
    elif [[ -n "${SF_TARGET_ORG:-}" ]]; then
        echo "$SF_TARGET_ORG"
    elif [[ -n "${SF_ORG_ALIAS:-}" ]]; then
        echo "$SF_ORG_ALIAS"
    elif [[ -n "$default_alias" ]]; then
        echo "$default_alias"
    else
        log_error "No org alias found. Set ORG_ALIAS or SF_TARGET_ORG"
        return 1
    fi
}

# =============================================================================
# FILE UTILITIES
# =============================================================================

# Backup file with timestamp
backup_file() {
    local file_path="$1"
    local backup_dir="${2:-$(dirname "$file_path")}"
    
    if [[ ! -f "$file_path" ]]; then
        log_error "File to backup does not exist: $file_path"
        return 1
    fi
    
    local timestamp
    timestamp=$(date '+%Y%m%d_%H%M%S')
    local filename
    filename=$(basename "$file_path")
    local backup_path="${backup_dir}/${filename}.backup.${timestamp}"
    
    if cp "$file_path" "$backup_path"; then
        log_success "Backup created: $backup_path"
        echo "$backup_path"
    else
        log_error "Failed to create backup of: $file_path"
        return 1
    fi
}

# Validate CSV file
validate_csv() {
    local csv_file="$1"
    local expected_columns="${2:-}"
    
    if [[ ! -f "$csv_file" ]]; then
        log_error "CSV file not found: $csv_file"
        return 1
    fi
    
    # Check if file is empty
    if [[ ! -s "$csv_file" ]]; then
        log_error "CSV file is empty: $csv_file"
        return 1
    fi
    
    # Get header line
    local header
    header=$(head -n 1 "$csv_file")
    
    if [[ -n "$expected_columns" ]]; then
        log_info "Validating CSV columns against expected: $expected_columns"
        # Basic column count check (you might want to enhance this)
        local actual_count
        actual_count=$(echo "$header" | tr ',' '\n' | wc -l)
        local expected_count
        expected_count=$(echo "$expected_columns" | tr ',' '\n' | wc -l)
        
        if [[ $actual_count -ne $expected_count ]]; then
            log_error "Column count mismatch. Expected: $expected_count, Found: $actual_count"
            return 1
        fi
    fi
    
    log_success "CSV validation passed: $csv_file"
}

# Check and fix line endings
check_line_endings() {
    local file_path="$1"
    local fix="${2:-false}"
    
    if [[ ! -f "$file_path" ]]; then
        log_error "File not found: $file_path"
        return 1
    fi
    
    if file "$file_path" | grep -q "CRLF"; then
        log_warning "File has Windows line endings: $file_path"
        
        if [[ "$fix" == "true" ]]; then
            if command -v dos2unix >/dev/null 2>&1; then
                backup_file "$file_path" >/dev/null
                dos2unix "$file_path"
                log_success "Converted line endings to Unix format"
            else
                log_error "dos2unix not found. Cannot fix line endings automatically."
                return 1
            fi
        fi
        return 1
    fi
    
    log_success "File has correct Unix line endings"
}

# Create directory safely
safe_mkdir() {
    local dir_path="$1"
    local mode="${2:-755}"
    
    if [[ -d "$dir_path" ]]; then
        log_debug "Directory already exists: $dir_path"
        return 0
    fi
    
    if mkdir -p "$dir_path"; then
        chmod "$mode" "$dir_path"
        log_success "Created directory: $dir_path"
    else
        log_error "Failed to create directory: $dir_path"
        return 1
    fi
}

# =============================================================================
# PROGRESS INDICATORS
# =============================================================================

# Simple spinner
show_spinner() {
    local pid=$1
    local message="${2:-Processing}"
    local spinner='|/-\'
    local i=0
    
    while kill -0 $pid 2>/dev/null; do
        printf "\r${CYAN}%s %c${NC}" "$message" "${spinner:$((i % 4)):1}"
        sleep 0.1
        ((i++))
    done
    printf "\r%*s\r" ${#message} ""
}

# Progress bar
show_progress() {
    local current=$1
    local total=$2
    local message="${3:-Progress}"
    local width=50
    
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    local bar=""
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=0; i<empty; i++)); do bar+="░"; done
    
    printf "\r${message}: [${GREEN}%s${NC}] %d%% (%d/%d)" "$bar" "$percentage" "$current" "$total"
    
    if [[ $current -eq $total ]]; then
        echo
    fi
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get script directory
get_script_dir() {
    local script_path="${BASH_SOURCE[1]}"
    cd "$(dirname "$script_path")" && pwd
}

# URL encode
url_encode() {
    local string="$1"
    python3 -c "import urllib.parse; print(urllib.parse.quote('$string'))"
}

# JSON pretty print (requires jq)
json_pretty() {
    if command_exists jq; then
        jq '.' <<< "$1"
    else
        echo "$1"
    fi
}

# Confirm user action
confirm_action() {
    local message="$1"
    local default="${2:-n}"
    
    local prompt
    if [[ "$default" == "y" ]]; then
        prompt="[Y/n]"
    else
        prompt="[y/N]"
    fi
    
    echo -n -e "${YELLOW}${message} ${prompt}:${NC} "
    read -r response
    
    if [[ -z "$response" ]]; then
        response="$default"
    fi
    
    case "$response" in
        [Yy]|[Yy][Ee][Ss])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# =============================================================================
# EXAMPLE USAGE
# =============================================================================

# Example function to demonstrate usage
demo_commons() {
    echo -e "${BOLD}Shell Commons Demo${NC}"
    echo "===================="
    
    log_info "This is an info message"
    log_success "This is a success message"
    log_warning "This is a warning message"
    log_error "This is an error message"
    
    echo
    log_info "Testing progress bar..."
    for i in {1..10}; do
        show_progress $i 10 "Demo progress"
        sleep 0.1
    done
    
    echo
    log_info "Testing Salesforce CLI detection..."
    if sf_cli=$(get_sf_cli); then
        log_success "Found Salesforce CLI: $sf_cli"
    else
        log_warning "Salesforce CLI not found"
    fi
    
    echo
    log_info "Demo completed!"
}

# =============================================================================
# INITIALIZATION
# =============================================================================

# Set default values if not set
: "${DEBUG:=false}"
: "${LOG_LEVEL:=info}"

# Initialize error handling if not disabled
if [[ "${DISABLE_ERROR_HANDLING:-false}" != "true" ]]; then
    setup_error_handling
fi

log_debug "Shell commons library loaded successfully"

# If script is run directly, show demo
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    demo_commons
fi
