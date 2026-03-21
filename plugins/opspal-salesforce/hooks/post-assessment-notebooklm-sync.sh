#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[post-assessment-notebooklm-sync] jq not found, skipping" >&2
    exit 0
fi

#
# Post-Assessment NotebookLM Sync Hook
#
# Automatically syncs assessment reports to NotebookLM client knowledge bases.
# Triggered after CPQ, RevOps, Automation, or other assessment completions.
#
# Version: 1.0.0
# Date: 2025-01-22
#

# Configuration
NOTEBOOKLM_AUTO_SYNC="${NOTEBOOKLM_AUTO_SYNC:-true}"
NOTEBOOKLM_SYNC_VERBOSE="${NOTEBOOKLM_SYNC_VERBOSE:-false}"

# Exit early if auto-sync is disabled
if [[ "$NOTEBOOKLM_AUTO_SYNC" != "true" ]]; then
    exit 0
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPSPAL_CORE="${PLUGIN_ROOT}/../opspal-core"
SOURCE_FORMATTER="${OPSPAL_CORE}/scripts/lib/notebooklm-source-formatter.js"

# Log function
log() {
    if [[ "$NOTEBOOKLM_SYNC_VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[NotebookLM Sync]${NC} $1"
    fi
}

log_success() {
    echo -e "${GREEN}[NotebookLM Sync]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[NotebookLM Sync]${NC} $1"
}

# Parse hook input
parse_hook_input() {
    local input="$1"

    # Extract tool name and parameters from hook context
    TOOL_NAME=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null)
    TOOL_INPUT=$(echo "$input" | jq -r '.tool_input // empty' 2>/dev/null)

    # Check if this is an assessment-related write
    if [[ -z "$TOOL_NAME" ]]; then
        log "No tool name in input, checking for file context"
        # Try to get file path from Write tool context
        FILE_PATH=$(echo "$input" | jq -r '.file_path // empty' 2>/dev/null)
    fi
}

# Detect assessment type from file path
detect_assessment_type() {
    local file_path="$1"

    case "$file_path" in
        *q2c-audit*|*cpq*|*quote*)
            echo "cpq"
            ;;
        *revops*|*pipeline*|*forecast*)
            echo "revops"
            ;;
        *automation*|*flow-audit*)
            echo "automation"
            ;;
        *security*|*permission*)
            echo "security"
            ;;
        *data-quality*|*dedup*)
            echo "data-quality"
            ;;
        *)
            echo "general"
            ;;
    esac
}

# Extract org alias from file path
extract_org_alias() {
    local file_path="$1"

    # Pattern: instances/salesforce/{org-alias}/...
    if [[ "$file_path" =~ instances/salesforce/([^/]+)/ ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi

    # Pattern: instances/{org-alias}/...
    if [[ "$file_path" =~ instances/([^/]+)/ ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi

    # Pattern: orgs/{org-alias}/...
    if [[ "$file_path" =~ orgs/([^/]+)/ ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi

    # Fallback to environment
    echo "${SF_TARGET_ORG:-unknown}"
}

# Check if file is an assessment report
is_assessment_report() {
    local file_path="$1"

    # Check file extension
    if [[ ! "$file_path" =~ \.(md|json|txt)$ ]]; then
        return 1
    fi

    # Check if in assessment-related directory or has assessment-related name
    if [[ "$file_path" =~ (audit|assessment|analysis|report|summary|findings) ]]; then
        return 0
    fi

    # Check specific patterns
    local filename=$(basename "$file_path")
    case "$filename" in
        *SUMMARY*|*REPORT*|*AUDIT*|*ASSESSMENT*|*FINDINGS*)
            return 0
            ;;
        RUNBOOK.md|ORG_CONTEXT.json)
            return 0
            ;;
    esac

    return 1
}

# Check if notebook registry exists for org
has_notebook_registry() {
    local org_alias="$1"

    # Check multiple possible locations
    local registry_paths=(
        "instances/${org_alias}/notebooklm/notebook-registry.json"
        "instances/salesforce/${org_alias}/notebooklm/notebook-registry.json"
        "orgs/${org_alias}/notebooklm/notebook-registry.json"
    )

    for registry_path in "${registry_paths[@]}"; do
        if [[ -f "$registry_path" ]]; then
            log "Found notebook registry at: $registry_path"
            return 0
        fi
    done

    return 1
}

# Queue sync request
queue_sync_request() {
    local file_path="$1"
    local org_alias="$2"
    local assessment_type="$3"

    # Create sync request file for the knowledge manager agent to process
    local sync_queue_dir="${HOME}/.claude/notebooklm-sync-queue"
    mkdir -p "$sync_queue_dir"

    local request_id=$(date +%s%N | md5sum | head -c 8)
    local request_file="${sync_queue_dir}/${request_id}.json"

    cat > "$request_file" << EOF
{
  "requestId": "${request_id}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "orgAlias": "${org_alias}",
  "assessmentType": "${assessment_type}",
  "sourcePath": "${file_path}",
  "status": "pending",
  "retries": 0
}
EOF

    log "Queued sync request: $request_file"
    echo "$request_file"
}

# Emit sync notification for agent
emit_sync_notification() {
    local file_path="$1"
    local org_alias="$2"
    local assessment_type="$3"

    # Output structured notification that agents can parse
    cat << EOF

📚 NotebookLM Sync Triggered
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Org: ${org_alias}
• Type: ${assessment_type}
• File: ${file_path}
• Action: Queue for sync to client knowledge base

To sync manually: /notebook-sync ${org_alias} ${file_path}
To skip: export NOTEBOOKLM_AUTO_SYNC=false

EOF
}

# Main hook logic
main() {
    local input="$1"

    # Parse the hook input
    parse_hook_input "$input"

    # Get file path from various sources
    local file_path="${FILE_PATH:-}"

    # Also check if passed as argument
    if [[ -z "$file_path" && -n "$2" ]]; then
        file_path="$2"
    fi

    # Check tool output for file paths (Write tool)
    if [[ -z "$file_path" && -n "$TOOL_INPUT" ]]; then
        file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
    fi

    # Exit if no file path
    if [[ -z "$file_path" ]]; then
        log "No file path detected, skipping"
        exit 0
    fi

    log "Checking file: $file_path"

    # Check if this is an assessment report
    if ! is_assessment_report "$file_path"; then
        log "Not an assessment report, skipping"
        exit 0
    fi

    # Extract org alias
    local org_alias=$(extract_org_alias "$file_path")
    log "Detected org alias: $org_alias"

    # Check if notebook exists for this org
    if ! has_notebook_registry "$org_alias"; then
        log_warn "No notebook registry for ${org_alias}. Run '/notebook-init ${org_alias}' to create one."
        exit 0
    fi

    # Detect assessment type
    local assessment_type=$(detect_assessment_type "$file_path")
    log "Detected assessment type: $assessment_type"

    # Queue the sync request
    local request_file=$(queue_sync_request "$file_path" "$org_alias" "$assessment_type")

    # Emit notification
    emit_sync_notification "$file_path" "$org_alias" "$assessment_type"

    log_success "Sync queued for ${org_alias} (${assessment_type})"
}

# Run main with stdin or arguments
if [[ -p /dev/stdin ]]; then
    input=$(cat)
    main "$input" "$@"
else
    main "" "$@"
fi
