#!/usr/bin/env bash
#
# Pre-Task Runbook Policy Enforcer Hook
#
# Purpose: Enforce runbook policy retrieval for operational agents before
#          they select fields. Ensures agents use policy-defined fields
#          instead of guessing.
#
# Part of the Runbook Policy Infrastructure (Phase 3).
#
# Behavior:
#   1. Detect if agent is operational (has field selection responsibility)
#   2. Extract org/object/task_type from Agent input
#   3. Issue RUNBOOK_REQUEST via runbook-policy-retriever.js
#   4. If not_found AND STRICT=1 → BLOCK operation
#   5. Inject RUNBOOK_RESPONSE into Agent input as runbook_policy
#   6. Log request for audit
#
# Configuration:
#   RUNBOOK_POLICY_ENABLED=1         - Enable/disable enforcement (default: 1)
#   RUNBOOK_POLICY_STRICT=0          - Block if policy not found (default: 0)
#   RUNBOOK_POLICY_VERBOSE=0         - Enable verbose logging (default: 0)
#   RUNBOOK_POLICY_AUTO_GENERATE=0   - Auto-generate missing policies (default: 0)
#
# Version: 1.0.0
# Date: 2026-02-02
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

PRETOOL_AGENT_CONTRACT="${SCRIPT_DIR}/lib/pretool-agent-contract.sh"
if [ -f "$PRETOOL_AGENT_CONTRACT" ]; then
    source "$PRETOOL_AGENT_CONTRACT"
fi

# Configuration
ENABLED="${RUNBOOK_POLICY_ENABLED:-1}"
STRICT="${RUNBOOK_POLICY_STRICT:-0}"
VERBOSE="${RUNBOOK_POLICY_VERBOSE:-0}"
AUTO_GENERATE="${RUNBOOK_POLICY_AUTO_GENERATE:-0}"
BLOCK_EXIT_CODE="${HOOK_BLOCK_EXIT_CODE:-2}"

# Operational agents that need field policies
# These agents have field selection responsibilities and benefit from
# policy-based field guidance (Runbook Policy Infrastructure Phase 3)
OPERATIONAL_AGENTS=(
    # Core Data Operations
    "sfdc-data-operations"
    "sfdc-data-import-manager"
    "sfdc-data-export-manager"
    "sfdc-data-generator"
    "sfdc-csv-enrichment"
    "sfdc-renewal-import"
    "sfdc-enrichment-manager"
    "sfdc-upsert-orchestrator"
    "sfdc-upsert-matcher"

    # Query & Reporting
    "sfdc-query-specialist"
    "sfdc-reports-dashboards"
    "sfdc-report-designer"
    "sfdc-dashboard-designer"
    "sfdc-dashboard-analyzer"
    "sfdc-dashboard-optimizer"
    "sfdc-reports-usage-auditor"
    "sfdc-report-validator"

    # Assessments & Audits
    "sfdc-revops-auditor"
    "sfdc-cpq-assessor"
    "sfdc-automation-auditor"
    "sfdc-architecture-auditor"
    "sfdc-object-auditor"
    "sfdc-quality-auditor"
    "sfdc-metadata-analyzer"
    "sfdc-field-analyzer"
    "win-loss-analyzer"

    # Data Quality & Discovery
    "sfdc-dedup-safety-copilot"
    "sfdc-state-discovery"
    "sfdc-discovery"

    # Cross-Platform (Core Plugin) - Query Salesforce
    "data-migration-orchestrator"
    "pipeline-intelligence-agent"
    "revops-data-quality-orchestrator"
    "revops-reporting-assistant"
    "unified-exec-dashboard-agent"
    "instance-sync"

    # Cross-Platform Dedup (Data Hygiene Plugin)
    "contact-dedup-orchestrator"
    "sfdc-hubspot-dedup-orchestrator"

    # HubSpot Plugin - Data Operations
    "hubspot-data-operations-manager"
    "hubspot-data"
    "hubspot-data-hygiene-specialist"
    "hubspot-analytics-reporter"
    "hubspot-reporting-builder"
    "hubspot-sfdc-sync-scraper"

    # Marketo Plugin - Data Operations
    "marketo-data-operations"
    "marketo-data-normalizer"
    "marketo-sfdc-sync-specialist"
)

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

normalize_pretool_agent_event "$HOOK_INPUT"

# Early exit if disabled, no input, or this is not an Agent tool event
if [ "$ENABLED" = "0" ] || [ -z "$HOOK_INPUT" ] || ! pretool_agent_event_is_agent; then
    emit_pretool_agent_noop
    exit 0
fi

AGENT_INPUT_JSON="${PRETOOL_TOOL_INPUT:-{}}"

# ============================================================================
# Functions
# ============================================================================

log_verbose() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[runbook-policy-enforcer] $1" >&2
    fi
}

log_info() {
    echo "[runbook-policy-enforcer] $1" >&2
}

# Check if agent is operational
is_operational_agent() {
    local agent_type="$1"

    for op_agent in "${OPERATIONAL_AGENTS[@]}"; do
        if [[ "$agent_type" == *"$op_agent"* ]]; then
            return 0
        fi
    done

    return 1
}

# Extract context from hook input
extract_context() {
    local input="$1"

    if ! command -v jq &>/dev/null; then
        log_verbose "jq not available, skipping policy enforcement"
        return 1
    fi

    # Extract agent type
    AGENT_TYPE=$(echo "$input" | jq -r '.subagent_type // ""' 2>/dev/null || echo "")

    # Extract prompt once for reuse
    local PROMPT
    PROMPT=$(echo "$input" | jq -r '.prompt // ""' 2>/dev/null || echo "")

    # Extract org from various locations (simple extraction first)
    ORG=$(echo "$input" | jq -r '.sf_org_context.detected_org // .org // .context.org // empty' 2>/dev/null || echo "")

    # If not found, try to extract from prompt
    if [ -z "$ORG" ]; then
        if [[ "$PROMPT" =~ --org[=\ ]([^\ ]+) ]]; then
            ORG="${BASH_REMATCH[1]}"
        fi
    fi

    # Try environment variables
    [ -z "$ORG" ] && ORG="${SF_TARGET_ORG:-}"
    [ -z "$ORG" ] && ORG="${SALESFORCE_ORG_ALIAS:-}"

    # Extract object from prompt or context
    OBJECT=$(echo "$input" | jq -r '
        .object //
        .context.object //
        ""
    ' 2>/dev/null || echo "")

    # Try to infer object from prompt
    if [ -z "$OBJECT" ]; then
        # Common patterns
        if [[ "$PROMPT" =~ (Account|Contact|Lead|Opportunity|Case|Quote|Order|Contract|User) ]]; then
            OBJECT="${BASH_REMATCH[1]}"
        fi
    fi

    # Extract task type
    TASK_TYPE=$(echo "$input" | jq -r '
        .task_type //
        .context.task_type //
        "backup"
    ' 2>/dev/null || echo "backup")

    # Infer task type from prompt/agent
    if [[ "$AGENT_TYPE" == *"export"* ]] || [[ "$PROMPT" =~ export ]]; then
        TASK_TYPE="export"
    elif [[ "$AGENT_TYPE" == *"import"* ]] || [[ "$PROMPT" =~ import|upsert ]]; then
        TASK_TYPE="migration"
    elif [[ "$AGENT_TYPE" == *"audit"* ]] || [[ "$PROMPT" =~ audit|assess ]]; then
        TASK_TYPE="audit"
    elif [[ "$PROMPT" =~ enrich ]]; then
        TASK_TYPE="enrichment"
    elif [[ "$PROMPT" =~ sync ]]; then
        TASK_TYPE="sync"
    fi

    log_verbose "Extracted: agent=$AGENT_TYPE, org=$ORG, object=$OBJECT, task_type=$TASK_TYPE"

    return 0
}

# Call policy retriever
retrieve_policy() {
    local org="$1"
    local object="$2"
    local task_type="$3"

    # Find the retriever script
    local retriever=""
    local search_paths=(
        "$PLUGIN_ROOT/../opspal-salesforce/scripts/lib/runbook-policy-retriever.js"
        "$PLUGIN_ROOT/../salesforce-plugin/scripts/lib/runbook-policy-retriever.js"
        "$(dirname "$PLUGIN_ROOT")/opspal-salesforce/scripts/lib/runbook-policy-retriever.js"
    )

    for path in "${search_paths[@]}"; do
        if [ -f "$path" ]; then
            retriever="$path"
            break
        fi
    done

    if [ -z "$retriever" ]; then
        log_verbose "Policy retriever not found"
        return 1
    fi

    # Call retriever
    local strict_flag=""
    [ "$STRICT" = "1" ] && strict_flag="--strict"

    local result
    result=$(node "$retriever" retrieve "$org" "$object" "$task_type" --json $strict_flag 2>/dev/null || echo "")

    if [ -z "$result" ]; then
        log_verbose "Policy retrieval returned empty"
        return 1
    fi

    echo "$result"
}

# ============================================================================
# Main Logic
# ============================================================================

# Check if we have input
if [ -z "$HOOK_INPUT" ]; then
    log_verbose "No input received"
    emit_pretool_agent_noop
    exit 0
fi

# Extract context
if ! extract_context "$AGENT_INPUT_JSON"; then
    emit_pretool_agent_noop
    exit 0
fi

# Check if this is an operational agent
if ! is_operational_agent "$AGENT_TYPE"; then
    log_verbose "Agent $AGENT_TYPE is not operational, skipping"
    emit_pretool_agent_noop
    exit 0
fi

# Check if we have enough context
if [ -z "$ORG" ]; then
    log_verbose "No org detected, cannot retrieve policy"
    emit_pretool_agent_noop
    exit 0
fi

if [ -z "$OBJECT" ]; then
    log_verbose "No object detected, proceeding without policy injection"
    emit_pretool_agent_noop
    exit 0
fi

# Retrieve policy
log_verbose "Retrieving policy for $ORG/$OBJECT/$TASK_TYPE"
POLICY_RESPONSE="$(retrieve_policy "$ORG" "$OBJECT" "$TASK_TYPE" || true)"

if [ -z "$POLICY_RESPONSE" ]; then
    log_verbose "No policy response"
    emit_pretool_agent_noop
    exit 0
fi

# Check status
POLICY_STATUS=$(echo "$POLICY_RESPONSE" | jq -r '.status // "error"' 2>/dev/null || echo "error")

case "$POLICY_STATUS" in
    "found"|"generated")
        # Inject policy into hook input
        log_info "✅ Runbook policy loaded for $OBJECT ($TASK_TYPE)"

        # Add policy to input
        ENHANCED_INPUT=$(echo "$AGENT_INPUT_JSON" | jq --argjson policy "$POLICY_RESPONSE" '.runbook_policy = $policy' 2>/dev/null || echo "$AGENT_INPUT_JSON")

        emit_pretool_agent_update \
          "$ENHANCED_INPUT" \
          "Injected runbook policy for ${OBJECT}" \
          "RUNBOOK_POLICY: Loaded ${POLICY_STATUS} policy guidance for ${ORG}.${OBJECT} (${TASK_TYPE})." \
          "RUNBOOK_POLICY_INJECTED" \
          "INFO"
        ;;

    "escalated")
        if [ "$STRICT" = "1" ]; then
            # Block the operation
            log_info "🚫 BLOCKED: No runbook policy found for $OBJECT"
            emit_pretool_agent_deny \
              "RUNBOOK_POLICY_MISSING: No field policy found for ${ORG}.${OBJECT} (${TASK_TYPE}). Run node scripts/lib/field-policy-manager.js init ${ORG} or set RUNBOOK_POLICY_STRICT=0 to bypass temporarily." \
              "" \
              "RUNBOOK_POLICY_MISSING" \
              "ERROR"
        else
            log_info "⚠️  No runbook policy found for $OBJECT (proceeding anyway)"
            emit_pretool_agent_noop
        fi
        ;;

    "not_found")
        log_verbose "Policy not found, proceeding with defaults"

        # Still inject the default response
        ENHANCED_INPUT=$(echo "$AGENT_INPUT_JSON" | jq --argjson policy "$POLICY_RESPONSE" '.runbook_policy = $policy' 2>/dev/null || echo "$AGENT_INPUT_JSON")

        emit_pretool_agent_update \
          "$ENHANCED_INPUT" \
          "Injected default runbook policy response for ${OBJECT}" \
          "RUNBOOK_POLICY: No explicit policy found for ${ORG}.${OBJECT}; default guidance was attached." \
          "RUNBOOK_POLICY_DEFAULTED" \
          "INFO"
        ;;

    "error")
        ERROR_MSG=$(echo "$POLICY_RESPONSE" | jq -r '.error.message // "Unknown error"' 2>/dev/null || echo "Unknown error")
        log_verbose "Policy retrieval error: $ERROR_MSG"
        emit_pretool_agent_noop
        ;;

    *)
        log_verbose "Unknown policy status: $POLICY_STATUS"
        emit_pretool_agent_noop
        ;;
esac

exit 0
