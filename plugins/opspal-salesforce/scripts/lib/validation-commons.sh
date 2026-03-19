#!/bin/bash

##############################################################################
# validation-commons.sh - Shared library for all Salesforce validators
##############################################################################

# Colors for output
# Some hooks source the shared core error handler first, which defines these as
# readonly globals. Guard every assignment so this library remains safe to
# source inside those hook pipelines.
if ! declare -p RED >/dev/null 2>&1; then export RED='\033[0;31m'; fi
if ! declare -p GREEN >/dev/null 2>&1; then export GREEN='\033[0;32m'; fi
if ! declare -p YELLOW >/dev/null 2>&1; then export YELLOW='\033[1;33m'; fi
if ! declare -p BLUE >/dev/null 2>&1; then export BLUE='\033[0;34m'; fi
if ! declare -p CYAN >/dev/null 2>&1; then export CYAN='\033[0;36m'; fi
if ! declare -p NC >/dev/null 2>&1; then export NC='\033[0m'; fi # No Color

# Get script directory
VALIDATION_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$VALIDATION_LIB_DIR")")"

# Cache configuration
export CACHE_DIR="${PROJECT_ROOT}/.validation-cache"
export METADATA_CACHE="${CACHE_DIR}/metadata"
export RESULTS_CACHE="${CACHE_DIR}/results"
export CACHE_TTL=3600  # 1 hour in seconds

# Ensure cache directories exist
mkdir -p "$METADATA_CACHE" "$RESULTS_CACHE"

##############################################################################
# Core Functions
##############################################################################

# Log with color and timestamp
log_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $1"
}

# Check if cache is valid
is_cache_valid() {
    local cache_file="$1"
    local ttl="${2:-$CACHE_TTL}"
    
    if [[ ! -f "$cache_file" ]]; then
        return 1
    fi
    
    local file_age=$(($(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null)))
    [[ $file_age -lt $ttl ]]
}

# Execute SOQL query with caching
execute_soql() {
    local query="$1"
    local org="${2:-$SF_TARGET_ORG}"
    local cache_key=$(echo "$query" | md5sum | cut -d' ' -f1)
    local cache_file="${METADATA_CACHE}/${org}_${cache_key}.json"
    
    # Check cache
    if is_cache_valid "$cache_file"; then
        cat "$cache_file"
        return 0
    fi
    
    # Execute query
    local result=$(sf data query --query "$query" --target-org "$org" --json 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        echo "$result" > "$cache_file"
        echo "$result"
    else
        return 1
    fi
}

# Get object metadata
get_object_metadata() {
    local object="$1"
    local org="${2:-$SF_TARGET_ORG}"
    local cache_file="${METADATA_CACHE}/${org}_${object}_describe.json"
    
    # Check cache
    if is_cache_valid "$cache_file"; then
        cat "$cache_file"
        return 0
    fi
    
    # Describe object
    local result=$(sf sobject describe --sobject "$object" --target-org "$org" --json 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        echo "$result" > "$cache_file"
        echo "$result"
    else
        return 1
    fi
}

# Get required fields for an object
get_required_fields() {
    local object="$1"
    local org="${2:-$SF_TARGET_ORG}"
    
    local metadata=$(get_object_metadata "$object" "$org")
    echo "$metadata" | jq -r '.result.fields[] | select(.nillable == false and .createable == true) | .name' 2>/dev/null
}

# Get field types
get_field_types() {
    local object="$1"
    local org="${2:-$SF_TARGET_ORG}"
    
    local metadata=$(get_object_metadata "$object" "$org")
    echo "$metadata" | jq -r '.result.fields[] | "\(.name):\(.type)"' 2>/dev/null
}

# Parse CSV headers
get_csv_headers() {
    local csv_file="$1"
    head -1 "$csv_file" | tr ',' '\n' | sed 's/"//g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# Count CSV records
count_csv_records() {
    local csv_file="$1"
    echo $(($(wc -l < "$csv_file") - 1))  # Subtract header row
}

# Validate org connection
validate_org_connection() {
    local org="${1:-$SF_TARGET_ORG}"
    
    if ! sf org display --target-org "$org" &>/dev/null; then
        log_error "Cannot connect to org: $org"
        echo "Please authenticate: sf org login web --alias $org"
        return 1
    fi
    
    log_success "Connected to org: $org"
    return 0
}

# Create validation report
create_validation_report() {
    local file="$1"
    local object="$2"
    local validator="$3"
    local status="$4"
    local details="$5"
    
    local report_file="${RESULTS_CACHE}/$(basename "$file" .csv)_${validator}_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "file": "$file",
    "object": "$object",
    "validator": "$validator",
    "status": "$status",
    "details": $details
}
EOF
    
    echo "$report_file"
}

# Split CSV into chunks
split_csv_file() {
    local csv_file="$1"
    local chunk_size="${2:-200}"
    local output_dir="${3:-$(dirname "$csv_file")}"
    
    local basename=$(basename "$csv_file" .csv)
    local header=$(head -1 "$csv_file")
    
    # Split file (excluding header)
    tail -n +2 "$csv_file" | split -l "$chunk_size" - "${output_dir}/${basename}_chunk_"
    
    # Add header to each chunk
    local chunks=()
    for chunk in "${output_dir}/${basename}_chunk_"*; do
        if [[ -f "$chunk" ]]; then
            local new_name="${chunk}.csv"
            echo "$header" > "$new_name"
            cat "$chunk" >> "$new_name"
            rm "$chunk"
            chunks+=("$new_name")
        fi
    done
    
    printf '%s\n' "${chunks[@]}"
}

# Merge CSV files
merge_csv_files() {
    local output_file="$1"
    shift
    local input_files=("$@")
    
    if [[ ${#input_files[@]} -eq 0 ]]; then
        log_error "No input files provided for merge"
        return 1
    fi
    
    # Get header from first file
    head -1 "${input_files[0]}" > "$output_file"
    
    # Append data from all files (excluding headers)
    for file in "${input_files[@]}"; do
        tail -n +2 "$file" >> "$output_file"
    done
    
    log_success "Merged ${#input_files[@]} files into $output_file"
}

# Check if field exists in object
field_exists() {
    local object="$1"
    local field="$2"
    local org="${3:-$SF_TARGET_ORG}"
    
    local metadata=$(get_object_metadata "$object" "$org")
    echo "$metadata" | jq -e ".result.fields[] | select(.name == \"$field\")" &>/dev/null
}

# Get lookup relationships
get_lookup_fields() {
    local object="$1"
    local org="${2:-$SF_TARGET_ORG}"
    
    local metadata=$(get_object_metadata "$object" "$org")
    echo "$metadata" | jq -r '.result.fields[] | select(.type == "reference") | .name' 2>/dev/null
}

# Validate ID format
is_valid_salesforce_id() {
    local id="$1"
    
    # Check for 15 or 18 character ID
    if [[ "$id" =~ ^[a-zA-Z0-9]{15}$ ]] || [[ "$id" =~ ^[a-zA-Z0-9]{18}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Generate validation summary
generate_validation_summary() {
    local total="$1"
    local passed="$2"
    local failed="$3"
    local fixed="$4"
    
    local pass_rate=$((passed * 100 / total))
    
    cat <<EOF

╔════════════════════════════════════════════╗
║         VALIDATION SUMMARY                  ║
╠════════════════════════════════════════════╣
║ Total Records:     $(printf "%24d" "$total") ║
║ Passed:           $(printf "%24d" "$passed") ║
║ Failed:           $(printf "%24d" "$failed") ║
║ Fixed:            $(printf "%24d" "$fixed") ║
║ Pass Rate:        $(printf "%23d%%" "$pass_rate") ║
╚════════════════════════════════════════════╝
EOF
}

# Export all functions
export -f log_info log_success log_warning log_error
export -f is_cache_valid execute_soql get_object_metadata
export -f get_required_fields get_field_types get_csv_headers
export -f count_csv_records validate_org_connection
export -f create_validation_report split_csv_file merge_csv_files
export -f field_exists get_lookup_fields is_valid_salesforce_id
export -f generate_validation_summary
