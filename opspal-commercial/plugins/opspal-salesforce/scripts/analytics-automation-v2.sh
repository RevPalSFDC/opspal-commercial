#!/bin/bash

# Salesforce Analytics Automation Workflow v2 - Hardened Edition
# 
# Production-ready automation with proper error handling, logging, and idempotency
#
# Usage: ./analytics-automation-v2.sh [command] [options]

set -euo pipefail  # Exit on error, undefined variables, pipe failures

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISCOVERY_TOOL="${SCRIPT_DIR}/lib/analytics-discovery-v2.js"
ERROR_HANDLER="${SCRIPT_DIR}/lib/analytics-error-handler.js"
TEMPLATE_DIR="${SCRIPT_DIR}/templates"
LOG_DIR="${SCRIPT_DIR}/logs"
CACHE_DIR="${SCRIPT_DIR}/.cache"
JSON_LOG="${LOG_DIR}/analytics-operations.jsonl"

# API Version pinning
export SALESFORCE_API_VERSION="${SALESFORCE_API_VERSION:-v64.0}"

# Safe mode by default
export ANALYTICS_SAFE_MODE="${ANALYTICS_SAFE_MODE:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure directories exist
mkdir -p "$LOG_DIR" "$CACHE_DIR"

# Error trap
trap 'handle_error $? $LINENO "$BASH_COMMAND" "$LAST_REQUEST_ID"' ERR

# Track last request ID
LAST_REQUEST_ID=""

# JSON logging function
json_log() {
    local level="$1"
    local message="$2"
    local data="${3:-{}}"
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local log_entry=$(jq -n \
        --arg ts "$timestamp" \
        --arg lvl "$level" \
        --arg msg "$message" \
        --arg org "${ORG_ALIAS:-default}" \
        --arg api "$SALESFORCE_API_VERSION" \
        --argjson data "$data" \
        '{timestamp: $ts, level: $lvl, message: $msg, org: $org, apiVersion: $api, data: $data}')
    
    echo "$log_entry" >> "$JSON_LOG"
}

# Error handling with request ID
handle_error() {
    local exit_code="$1"
    local line_number="$2"
    local command="$3"
    local request_id="${4:-unknown}"
    
    echo -e "${RED}ERROR: Command failed at line $line_number${NC}" >&2
    echo -e "${RED}Command: $command${NC}" >&2
    echo -e "${RED}Exit code: $exit_code${NC}" >&2
    
    if [ "$request_id" != "unknown" ]; then
        echo -e "${YELLOW}Request ID: $request_id${NC}" >&2
    fi
    
    json_log "error" "Command failed" "{\"line\": $line_number, \"command\": \"$command\", \"exitCode\": $exit_code, \"requestId\": \"$request_id\"}"
    
    # Analyze error for recovery suggestions
    if [ -f "$ERROR_HANDLER" ]; then
        echo -e "${YELLOW}Analyzing error for recovery suggestions...${NC}" >&2
        node "$ERROR_HANDLER" analyze "$command" 2>/dev/null || true
    fi
    
    exit "$exit_code"
}

# Success message with timing
success() {
    local message="$1"
    local start_time="${2:-}"
    
    if [ -n "$start_time" ]; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✓ $message (${duration}s)${NC}"
        json_log "success" "$message" "{\"duration\": $duration}"
    else
        echo -e "${GREEN}✓ $message${NC}"
        json_log "success" "$message"
    fi
}

# Info message
info() {
    echo -e "${BLUE}ℹ $1${NC}"
    json_log "info" "$1"
}

# Warning message
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
    json_log "warning" "$1"
}

# Discover command - list report types
cmd_discover() {
    local filter="${1:-}"
    local org_alias="${ORG_ALIAS:-}"
    
    info "Discovering report types${filter:+ matching '$filter'}"
    
    local result
    result=$(node "$DISCOVERY_TOOL" types "$filter" --org="$org_alias" 2>&1) || handle_error $? $LINENO "discover report types"
    
    echo "$result" | jq -r '.[] | "\(.type) - \(.label) [\(.category)]"' 2>/dev/null || echo "$result"
    
    success "Discovery complete"
}

# Dry run command - validate only
cmd_dryrun() {
    local metadata_file="$1"
    local org_alias="${ORG_ALIAS:-}"
    
    if [ ! -f "$metadata_file" ]; then
        handle_error 1 $LINENO "Metadata file not found: $metadata_file"
    fi
    
    info "Running validation (dry run) for $metadata_file"
    
    local result
    result=$(node "$DISCOVERY_TOOL" validate "$metadata_file" --org="$org_alias" 2>&1) || handle_error $? $LINENO "validate metadata"
    
    if echo "$result" | jq -e '.valid == true' > /dev/null 2>&1; then
        success "Validation passed"
        echo "Preview: $(echo "$result" | jq -r '.rowCount // 0') rows, $(echo "$result" | jq -r '.groupCount // 0') groups"
    else
        local error=$(echo "$result" | jq -r '.error // .message')
        local suggestion=$(echo "$result" | jq -r '.suggestion // ""')
        
        warning "Validation failed: $error"
        if [ -n "$suggestion" ]; then
            info "Suggestion: $suggestion"
        fi
        
        return 1
    fi
}

# Upsert command - create or update report (idempotent)
cmd_upsert() {
    local metadata_file="$1"
    local folder_id="${2:-}"
    local template_key="${3:-custom}"
    local org_alias="${ORG_ALIAS:-}"
    
    if [ ! -f "$metadata_file" ]; then
        handle_error 1 $LINENO "Metadata file not found: $metadata_file"
    fi
    
    if [ "$ANALYTICS_SAFE_MODE" = "true" ]; then
        warning "Safe mode enabled. Set ANALYTICS_SAFE_MODE=false to create/update reports"
        return 1
    fi
    
    local start_time=$(date +%s)
    
    info "Upserting report from $metadata_file"
    
    # First validate
    cmd_dryrun "$metadata_file" || return 1
    
    # Then upsert
    local result
    result=$(node "$DISCOVERY_TOOL" upsert "$metadata_file" \
        --org="$org_alias" \
        --write=true \
        --folder="$folder_id" \
        --template="$template_key" 2>&1) || handle_error $? $LINENO "upsert report"
    
    local report_id=$(echo "$result" | jq -r '.id // ""')
    local operation=$(echo "$result" | jq -r '.operation // "unknown"')
    local url=$(echo "$result" | jq -r '.url // ""')
    
    if [ -n "$report_id" ]; then
        success "Report $operation: $report_id" "$start_time"
        echo "URL: $url"
        
        json_log "report_${operation}" "Report ${operation} successfully" \
            "{\"reportId\": \"$report_id\", \"folderId\": \"$folder_id\", \"templateKey\": \"$template_key\"}"
    else
        warning "Unexpected response: $result"
    fi
}

# Run command - execute report and get results
cmd_run() {
    local report_id="$1"
    local org_alias="${ORG_ALIAS:-}"
    
    info "Running report $report_id"
    
    # This would call the report run API
    warning "Run command not yet implemented"
}

# Cleanup command - remove old cache and logs
cmd_cleanup() {
    local days="${1:-30}"
    
    info "Cleaning up files older than $days days"
    
    # Clean cache
    find "$CACHE_DIR" -type f -mtime +$days -delete 2>/dev/null || true
    
    # Archive old logs
    find "$LOG_DIR" -name "*.log" -mtime +$days -exec gzip {} \; 2>/dev/null || true
    
    success "Cleanup complete"
}

# Template command - create from template with placeholders
cmd_template() {
    local template_key="$1"
    local folder_id="${2:-}"
    local org_alias="${ORG_ALIAS:-}"
    
    if [ -z "$template_key" ]; then
        echo "Available templates:"
        jq -r '.templates | keys[]' "${TEMPLATE_DIR}/gong-report-templates.json" 2>/dev/null || echo "No templates found"
        return 0
    fi
    
    if [ -z "$folder_id" ]; then
        warning "Folder ID required for template creation"
        return 1
    fi
    
    info "Creating report from template: $template_key"
    
    # Extract template and create temp metadata file
    local temp_metadata="${CACHE_DIR}/template_${template_key}_$$.json"
    
    jq ".templates.${template_key}.metadata // empty" \
        "${TEMPLATE_DIR}/gong-report-templates.json" > "$temp_metadata" 2>/dev/null
    
    if [ ! -s "$temp_metadata" ]; then
        rm -f "$temp_metadata"
        handle_error 1 $LINENO "Template '$template_key' not found"
    fi
    
    # Apply placeholders from environment
    if [ -n "${REPORT_DAYS:-}" ]; then
        sed -i "s/\${DAYS:=[0-9]*}/${REPORT_DAYS}/g" "$temp_metadata"
    fi
    
    # Add folder ID
    jq ".folderId = \"$folder_id\"" "$temp_metadata" > "${temp_metadata}.tmp" && mv "${temp_metadata}.tmp" "$temp_metadata"
    
    # Wrap in reportMetadata
    jq '{reportMetadata: .}' "$temp_metadata" > "${temp_metadata}.tmp" && mv "${temp_metadata}.tmp" "$temp_metadata"
    
    # Upsert using template
    cmd_upsert "$temp_metadata" "$folder_id" "$template_key"
    
    # Cleanup
    rm -f "$temp_metadata"
}

# Main function
main() {
    local command="${1:-}"
    shift || true
    
    # Parse global options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --org)
                export ORG_ALIAS="$2"
                shift 2
                ;;
            --write)
                export ANALYTICS_SAFE_MODE="false"
                shift
                ;;
            --api-version)
                export SALESFORCE_API_VERSION="$2"
                shift 2
                ;;
            --days)
                export REPORT_DAYS="$2"
                shift 2
                ;;
            *)
                break
                ;;
        esac
    done
    
    case "$command" in
        discover)
            cmd_discover "$@"
            ;;
            
        dryrun|validate)
            cmd_dryrun "$@"
            ;;
            
        upsert|create|update)
            cmd_upsert "$@"
            ;;
            
        run|execute)
            cmd_run "$@"
            ;;
            
        cleanup)
            cmd_cleanup "$@"
            ;;
            
        template)
            cmd_template "$@"
            ;;
            
        logs)
            # Show recent JSON logs
            tail -n 20 "$JSON_LOG" | jq '.' 2>/dev/null || tail -n 20 "$LOG_DIR"/*.log 2>/dev/null || echo "No logs found"
            ;;
            
        help|--help|-h|"")
            cat << EOF
Salesforce Analytics Automation v2 - Production Ready

Usage: $0 <command> [options] [arguments]

Commands:
  discover [filter]           - List available report types
  dryrun <metadata.json>     - Validate report metadata (read-only)
  upsert <metadata.json>     - Create or update report (idempotent)
  run <reportId>             - Execute report and get results
  template <key> [folderId]  - Create from template with placeholders
  cleanup [days]             - Clean up old cache and logs
  logs                       - Show recent operation logs

Global Options:
  --org <alias>              - Salesforce org alias
  --write                    - Enable write operations (disable safe mode)
  --api-version <version>    - Salesforce API version (default: v64.0)
  --days <number>            - Override DAYS placeholder in templates

Environment Variables:
  SALESFORCE_API_VERSION     - API version to use (default: v64.0)
  ANALYTICS_SAFE_MODE        - Enable safe mode (default: true)
  ORG_ALIAS                  - Default org alias
  REPORT_DAYS                - Default days for date filters

Examples:
  # Discover Gong report types
  $0 discover Gong

  # Validate report metadata
  $0 dryrun metadata.json --org myorg

  # Create/update report (idempotent)
  $0 upsert metadata.json folder_id template_key --org myorg --write

  # Create from template
  $0 template calls_last_30_days 00lXXXXXXXX --org myorg --write --days 30

  # View operation logs
  $0 logs

Safe Mode:
  By default, all write operations are disabled. Use --write or set
  ANALYTICS_SAFE_MODE=false to enable report creation/updates.

Logging:
  All operations are logged to $JSON_LOG in JSON format
  for parsing and analysis.

EOF
            ;;
            
        *)
            echo "Unknown command: $command"
            echo "Run '$0 help' for usage"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"