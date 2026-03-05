#!/bin/bash

# Safe Flow Query Wrapper
# Prevents "Cannot iterate over null" errors when querying Salesforce Flows
# Instance-agnostic solution that handles all edge cases

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Safe query function for Flows
safe_flow_query() {
    local query="$1"
    local org="${2:-$SF_TARGET_ORG}"
    local output_format="${3:-json}"  # json, table, or csv

    # Validate org is set
    if [ -z "$org" ]; then
        echo -e "${RED}❌ Error: No org specified and SF_TARGET_ORG not set${NC}" >&2
        echo "[]"
        return 1
    fi

    # Execute query with proper error handling
    local result=$(sf data query \
        --query "$query" \
        --use-tooling-api \
        --target-org "$org" \
        --json 2>/dev/null)

    # Check if result is empty
    if [ -z "$result" ]; then
        echo -e "${YELLOW}⚠️  Warning: Query returned no response${NC}" >&2
        echo "[]"
        return 1
    fi

    # Check for API errors
    local status=$(echo "$result" | jq -r '.status // 1')
    if [ "$status" != "0" ]; then
        local error_msg=$(echo "$result" | jq -r '.message // "Unknown error"')
        echo -e "${RED}❌ Query error: $error_msg${NC}" >&2
        echo "[]"
        return 1
    fi

    # Return based on format
    case "$output_format" in
        json)
            # Safe extraction with null handling
            echo "$result" | jq '
                if .result != null and .result.records != null then
                    .result.records
                else
                    []
                end'
            ;;
        table)
            # Format as table with null safety
            echo "$result" | jq -r '
                if .result != null and .result.records != null and (.result.records | length) > 0 then
                    .result.records[] |
                    [.DeveloperName // "N/A", .MasterLabel // "N/A", .Status // "N/A", .VersionNumber // 0] |
                    @tsv
                else
                    "No flows found"
                end'
            ;;
        csv)
            # CSV format with headers
            echo "$result" | jq -r '
                if .result != null and .result.records != null and (.result.records | length) > 0 then
                    ["DeveloperName","MasterLabel","Status","VersionNumber"],
                    (.result.records[] |
                    [.DeveloperName // "", .MasterLabel // "", .Status // "", .VersionNumber // 0]) |
                    @csv
                else
                    "No flows found"
                end'
            ;;
        *)
            echo "$result"
            ;;
    esac
}

# Get flow by exact DeveloperName
get_flow_by_name() {
    local developer_name="$1"
    local org="${2:-$SF_TARGET_ORG}"

    local query="SELECT Id, DeveloperName, MasterLabel, Status, VersionNumber,
                        ProcessType, TriggerType, IsActive, Description,
                        LastModifiedDate, CreatedDate, LastModifiedBy.Name
                 FROM Flow
                 WHERE DeveloperName = '${developer_name}'
                 ORDER BY VersionNumber DESC"

    safe_flow_query "$query" "$org" "json" | jq '.[0] // null'
}

# Search flows by pattern
search_flows() {
    local pattern="$1"
    local org="${2:-$SF_TARGET_ORG}"
    local active_only="${3:-false}"

    local query="SELECT Id, DeveloperName, MasterLabel, Status, VersionNumber,
                        ProcessType, TriggerType, IsActive
                 FROM Flow
                 WHERE (MasterLabel LIKE '%${pattern}%' OR DeveloperName LIKE '%${pattern}%')"

    if [ "$active_only" = "true" ]; then
        query="$query AND IsActive = true"
    fi

    query="$query ORDER BY MasterLabel, VersionNumber DESC"

    safe_flow_query "$query" "$org" "json"
}

# Get all active flows
get_active_flows() {
    local org="${1:-$SF_TARGET_ORG}"
    local process_type="${2:-}"

    local query="SELECT Id, DeveloperName, MasterLabel, Status, VersionNumber,
                        ProcessType, TriggerType, IsActive, Description
                 FROM Flow
                 WHERE IsActive = true"

    if [ -n "$process_type" ]; then
        query="$query AND ProcessType = '${process_type}'"
    fi

    query="$query ORDER BY ProcessType, MasterLabel"

    safe_flow_query "$query" "$org" "json"
}

# Count flows safely
count_flows() {
    local org="${1:-$SF_TARGET_ORG}"
    local filter="${2:-}"

    local query="SELECT COUNT() FROM Flow"

    if [ -n "$filter" ]; then
        query="$query WHERE $filter"
    fi

    local result=$(sf data query \
        --query "$query" \
        --use-tooling-api \
        --target-org "$org" \
        --json 2>/dev/null)

    # Safe extraction of count with multiple fallbacks
    local count=$(echo "$result" | jq '
        if .result != null then
            if .result.totalSize != null then
                .result.totalSize
            elif .result.records != null and (.result.records | length) > 0 then
                .result.records[0].expr0 // 0
            else
                0
            end
        else
            0
        end')

    echo "$count"
}

# Get flow versions
get_flow_versions() {
    local developer_name="$1"
    local org="${2:-$SF_TARGET_ORG}"

    local query="SELECT Id, VersionNumber, Status, LastModifiedDate, LastModifiedBy.Name
                 FROM Flow
                 WHERE DeveloperName = '${developer_name}'
                 ORDER BY VersionNumber DESC"

    safe_flow_query "$query" "$org" "json"
}

# Check if flow exists
flow_exists() {
    local developer_name="$1"
    local org="${2:-$SF_TARGET_ORG}"

    local count=$(count_flows "$org" "DeveloperName = '${developer_name}'")

    if [ "$count" -gt 0 ]; then
        return 0
    else
        return 1
    fi
}

# Main entry point for CLI usage
main() {
    local command="${1:-help}"
    shift

    case "$command" in
        query)
            safe_flow_query "$@"
            ;;
        get)
            get_flow_by_name "$@"
            ;;
        search)
            search_flows "$@"
            ;;
        active)
            get_active_flows "$@"
            ;;
        count)
            count_flows "$@"
            ;;
        versions)
            get_flow_versions "$@"
            ;;
        exists)
            if flow_exists "$@"; then
                echo "true"
                exit 0
            else
                echo "false"
                exit 1
            fi
            ;;
        help|*)
            cat << EOF
Safe Flow Query Tool - Prevents null iteration errors

Usage: $0 <command> [options]

Commands:
  query <soql> [org] [format]     - Execute safe SOQL query
  get <name> [org]                - Get flow by exact DeveloperName
  search <pattern> [org] [active] - Search flows by pattern
  active [org] [type]             - List all active flows
  count [org] [filter]            - Count flows safely
  versions <name> [org]           - Get all versions of a flow
  exists <name> [org]             - Check if flow exists
  help                            - Show this help message

Examples:
  $0 query "SELECT Id, MasterLabel FROM Flow WHERE IsActive = true" myorg json
  $0 get "Opportunity_AfterSave_Master" myorg
  $0 search "Opportunity" myorg true
  $0 active myorg AutoLaunchedFlow
  $0 count myorg "IsActive = true"
  $0 exists "Lead_Assignment_v2" myorg

Environment Variables:
  SF_TARGET_ORG - Default org to use if not specified

Output Formats:
  json  - JSON array (default)
  table - Tab-separated values
  csv   - Comma-separated values

EOF
            ;;
    esac
}

# Export functions for sourcing
export -f safe_flow_query
export -f get_flow_by_name
export -f search_flows
export -f get_active_flows
export -f count_flows
export -f get_flow_versions
export -f flow_exists

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi