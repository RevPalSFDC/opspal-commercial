#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook
#
# Pre-Task Field Dictionary Injector Hook
#
# Purpose: Automatically inject field dictionary context into the Agent tool
#          invocations for reporting agents so they understand field
#          semantics, use cases, and reporting guidance.
#
# Behavior:
#   1. Detects agent type from Agent tool input
#   2. Checks if agent is a reporting agent that needs field context
#   3. Extracts org slug from prompt or environment
#   4. Loads field dictionary and generates focused context
#   5. Injects context into the task prompt
#   6. Always passes through (non-blocking)
#
# Configuration:
#   FIELD_DICT_INJECTION_ENABLED=1     - Enable/disable injection (default: 1)
#   FIELD_DICT_INJECTION_VERBOSE=1     - Show detailed output (default: 0)
#   FIELD_DICT_CACHE_TTL=300           - Cache TTL in seconds (default: 300)
#
# Version: 1.0.0
# Date: 2026-01-28
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Source standardized error handler if available
ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
if [ -f "$ERROR_HANDLER" ]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-field-dictionary-injector"
    set_lenient_mode 2>/dev/null || true
fi

PRETOOL_AGENT_CONTRACT="${SCRIPT_DIR}/lib/pretool-agent-contract.sh"
if [ -f "$PRETOOL_AGENT_CONTRACT" ]; then
    source "$PRETOOL_AGENT_CONTRACT"
fi

# Configuration
ENABLED="${FIELD_DICT_INJECTION_ENABLED:-1}"
VERBOSE="${FIELD_DICT_INJECTION_VERBOSE:-0}"
CACHE_TTL="${FIELD_DICT_CACHE_TTL:-300}"
LOADER_SCRIPT="$PLUGIN_ROOT/scripts/lib/field-dictionary-loader.js"

# Reporting agents that should receive field dictionary context
# Opt-out: Add agent names to FIELD_DICT_EXCLUDE_AGENTS env var (comma-separated)
REPORTING_AGENTS=(
    # Reports & Dashboards
    "sfdc-reports-dashboards"
    "sfdc-report-designer"
    "sfdc-report-template-deployer"
    "sfdc-report-validator"
    "sfdc-reports-usage-auditor"
    "sfdc-dashboard-designer"
    "sfdc-dashboard-analyzer"
    "sfdc-dashboard-optimizer"
    "sfdc-dashboard-migrator"
    # Pipeline & Revenue Intelligence
    "pipeline-intelligence-agent"
    "unified-exec-dashboard-agent"
    "revops-reporting-assistant"
    "revops-deal-scorer"
    "revops-lead-scorer"
    "hubspot-revenue-intelligence"
    "hubspot-ai-revenue-intelligence"
    "hubspot-reporting-builder"
    "hubspot-analytics-reporter"
    "hubspot-attribution-analyst"
    # GTM Planning & Forecasting
    "gtm-strategic-reports-orchestrator"
    "gtm-retention-analyst"
    "gtm-revenue-modeler"
    "gtm-market-intelligence"
    "gtm-quota-capacity"
    "gtm-data-insights"
    "forecast-orchestrator"
    # Assessment & Audit
    "sales-funnel-diagnostic"
    "sfdc-revops-auditor"
    "sfdc-cpq-assessor"
    "sfdc-automation-auditor"
    "sfdc-architecture-auditor"
    "sfdc-object-auditor"
    "sfdc-revops-coordinator"
    "hubspot-assessment-analyzer"
    "marketo-analytics-assessor"
    "marketo-program-roi-assessor"
    "marketo-lead-quality-assessor"
    "marketo-revenue-cycle-analyst"
    # Scoring & Intelligence
    "win-loss-analyzer"
    "hubspot-lead-scoring-specialist"
    "hubspot-pipeline-manager"
    "marketo-lead-scoring-architect"
    # Cross-Platform & Visualization
    "web-viz-generator"
    "benchmark-research-agent"
    "cross-platform-pipeline-orchestrator"
    "data-migration-orchestrator"
    # OKR
    "okr-data-aggregator"
    "okr-executive-reporter"
    "okr-progress-tracker"
    "okr-dashboard-generator"
    # CS & Renewals
    "cs-operations-orchestrator"
    "hubspot-renewals-specialist"
    "sfdc-territory-orchestrator"
    "compliance-report-generator"
)

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
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
        echo "[field-dict-injector] $1" >&2
    fi
}

log_info() {
    echo "[field-dict-injector] $1" >&2
}

# Extract agent type from hook input
get_agent_type() {
    if command -v jq &>/dev/null; then
        echo "$AGENT_INPUT_JSON" | jq -r '.subagent_type // ""' 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Normalize agent type (remove plugin prefix if present)
normalize_agent_type() {
    local agent="$1"
    echo "$agent" | sed -E 's/^[A-Za-z0-9-]+://'
}

# Check if agent is excluded via opt-out env var
is_excluded_agent() {
    local agent="$1"
    local exclude_list="${FIELD_DICT_EXCLUDE_AGENTS:-}"

    if [ -z "$exclude_list" ]; then
        return 1
    fi

    IFS=',' read -ra EXCLUDED <<< "$exclude_list"
    for excluded in "${EXCLUDED[@]}"; do
        excluded=$(echo "$excluded" | xargs)  # trim whitespace
        if [ "$agent" = "$excluded" ]; then
            return 0
        fi
    done
    return 1
}

# Check if agent is a reporting agent that needs field context
is_reporting_agent() {
    local agent="$1"
    local normalized
    normalized=$(normalize_agent_type "$agent")

    # Check opt-out exclusion first
    if is_excluded_agent "$normalized"; then
        log_verbose "Agent '$normalized' excluded via FIELD_DICT_EXCLUDE_AGENTS"
        return 1
    fi

    for reporting_agent in "${REPORTING_AGENTS[@]}"; do
        if [ "$normalized" = "$reporting_agent" ] || [ "$agent" = "$reporting_agent" ]; then
            return 0
        fi
    done
    return 1
}

# Get prompt from hook input
get_prompt() {
    if command -v jq &>/dev/null; then
        echo "$AGENT_INPUT_JSON" | jq -r '.prompt // ""' 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Extract org slug from prompt or environment
extract_org_slug() {
    local prompt="$1"
    local hook_org=""

    hook_org=$(echo "$AGENT_INPUT_JSON" | jq -r '.sf_org_context.detected_org // .org // .context.org // empty' 2>/dev/null || echo "")
    if [ -n "$hook_org" ]; then
        echo "$hook_org"
        return 0
    fi

    # First check environment
    if [ -n "${ORG_SLUG:-}" ]; then
        echo "$ORG_SLUG"
        return 0
    fi

    # Try to extract from prompt using common patterns
    # Pattern 1: "for {org}" or "for {org}-"
    local org
    org=$(echo "$prompt" | grep -oE 'for [a-z0-9-]+' | head -1 | sed 's/for //')
    if [ -n "$org" ]; then
        echo "$org"
        return 0
    fi

    # Pattern 2: "org: {org}" or "org={org}"
    org=$(echo "$prompt" | grep -oiE 'org[=:] ?[a-z0-9-]+' | head -1 | sed -E 's/org[=:] ?//')
    if [ -n "$org" ]; then
        echo "$org"
        return 0
    fi

    # Pattern 3: Check for known org names in prompt (from orgs directory)
    if [ -d "orgs" ]; then
        for dir in orgs/*/; do
            local org_name
            org_name=$(basename "$dir")
            if echo "$prompt" | grep -qi "$org_name"; then
                echo "$org_name"
                return 0
            fi
        done
    fi

    return 1
}

# Check if field dictionary exists for org
dictionary_exists() {
    local org="$1"
    local dict_path="orgs/${org}/configs/field-dictionary.yaml"

    if [ -f "$dict_path" ]; then
        return 0
    fi

    # Also check JSON variant
    dict_path="orgs/${org}/configs/field-dictionary.json"
    if [ -f "$dict_path" ]; then
        return 0
    fi

    return 1
}

# Generate field context using the loader script
generate_field_context() {
    local org="$1"
    local audience="${2:-}"
    local tags="${3:-}"

    if [ ! -f "$LOADER_SCRIPT" ]; then
        log_verbose "Loader script not found: $LOADER_SCRIPT"
        return 1
    fi

    local args=("context" "$org" "--format" "markdown")

    if [ -n "$audience" ]; then
        args+=("--audience" "$audience")
    fi

    if [ -n "$tags" ]; then
        args+=("--tags" "$tags")
    fi

    # Execute loader to generate context
    node "$LOADER_SCRIPT" "${args[@]}" 2>/dev/null || return 1
}

# Build injection message
build_injection_message() {
    local org="$1"
    local agent="$2"
    local context="$3"

    local msg=""
    msg+="
┌─────────────────────────────────────────────────────────────────┐
│  📊 FIELD DICTIONARY CONTEXT INJECTED                           │
├─────────────────────────────────────────────────────────────────┤
│  Agent: $agent
│  Org: $org
│  Dictionary: orgs/${org}/configs/field-dictionary.yaml
│                                                                 │
│  Use the field definitions below for accurate field selection   │
│  and reporting guidance.                                        │
└─────────────────────────────────────────────────────────────────┘
"
    echo "$msg"
}

# Detect audience from prompt
detect_audience_from_prompt() {
    local prompt="$1"
    local prompt_lower
    prompt_lower=$(echo "$prompt" | tr '[:upper:]' '[:lower:]')

    if echo "$prompt_lower" | grep -qE "(executive|board|c-suite|ceo|cfo|leadership)"; then
        echo "Executive"
        return 0
    fi

    if echo "$prompt_lower" | grep -qE "(manager|director|team lead)"; then
        echo "Manager"
        return 0
    fi

    if echo "$prompt_lower" | grep -qE "(analyst|data|report builder)"; then
        echo "Analyst"
        return 0
    fi

    if echo "$prompt_lower" | grep -qE "(operations|ops|admin)"; then
        echo "Operations"
        return 0
    fi

    # Default - no specific audience filter
    echo ""
}

# Detect relevant tags from prompt
detect_tags_from_prompt() {
    local prompt="$1"
    local prompt_lower
    prompt_lower=$(echo "$prompt" | tr '[:upper:]' '[:lower:]')
    local tags=()

    if echo "$prompt_lower" | grep -qE "(revenue|amount|arr|mrr|tcv|acv)"; then
        tags+=("Revenue")
    fi

    if echo "$prompt_lower" | grep -qE "(pipeline|stage|forecast|probability)"; then
        tags+=("Pipeline")
    fi

    if echo "$prompt_lower" | grep -qE "(cpq|quote|subscription|contract)"; then
        tags+=("CPQ")
    fi

    if echo "$prompt_lower" | grep -qE "(marketing|campaign|lead source|utm)"; then
        tags+=("Marketing")
    fi

    if echo "$prompt_lower" | grep -qE "(renewal|churn|retention)"; then
        tags+=("Renewal")
    fi

    if echo "$prompt_lower" | grep -qE "(service|case|support|ticket)"; then
        tags+=("Service")
    fi

    # Return comma-separated list
    if [ ${#tags[@]} -gt 0 ]; then
        IFS=','
        echo "${tags[*]}"
        return 0
    fi

    echo ""
}

# ============================================================================
# Main Logic
# ============================================================================

# Get agent type
AGENT_TYPE=$(get_agent_type)

if [ -z "$AGENT_TYPE" ]; then
    log_verbose "No agent type detected in input"
    emit_pretool_agent_noop
    exit 0
fi

# Normalize and check if reporting agent
NORMALIZED_AGENT=$(normalize_agent_type "$AGENT_TYPE")
log_verbose "Agent type: $AGENT_TYPE -> normalized: $NORMALIZED_AGENT"

if ! is_reporting_agent "$AGENT_TYPE"; then
    log_verbose "Not a reporting agent, skipping field dictionary injection"
    emit_pretool_agent_noop
    exit 0
fi

log_verbose "Reporting agent detected: $NORMALIZED_AGENT"

# Get prompt and extract org slug
PROMPT=$(get_prompt)
ORG_SLUG_DETECTED=$(extract_org_slug "$PROMPT" || echo "")

if [ -z "$ORG_SLUG_DETECTED" ]; then
    log_verbose "Could not determine org slug from prompt or environment"
    emit_pretool_agent_noop
    exit 0
fi

log_verbose "Org slug detected: $ORG_SLUG_DETECTED"

# Check if dictionary exists
if ! dictionary_exists "$ORG_SLUG_DETECTED"; then
    log_verbose "No field dictionary found for org: $ORG_SLUG_DETECTED"
    # Emit a structured status note so the agent contract stays valid.
    if command -v jq &>/dev/null; then
        ENHANCED_INPUT=$(echo "$AGENT_INPUT_JSON" | jq \
            --arg org "$ORG_SLUG_DETECTED" \
            '. + {
                field_dictionary_status: {
                    available: false,
                    org: $org,
                    note: "No field dictionary found. Run /generate-field-dictionary to create one."
                }
            }'
        )
        emit_pretool_agent_update \
          "$ENHANCED_INPUT" \
          "Field dictionary unavailable for ${ORG_SLUG_DETECTED}" \
          "FIELD_DICTIONARY_STATUS: No field dictionary is available for this org yet." \
          "FIELD_DICTIONARY_STATUS" \
          "INFO"
        exit 0
    fi
    emit_pretool_agent_noop
    exit 0
fi

# Detect audience and tags from prompt
AUDIENCE=$(detect_audience_from_prompt "$PROMPT")
TAGS=$(detect_tags_from_prompt "$PROMPT")

log_verbose "Audience: ${AUDIENCE:-all}, Tags: ${TAGS:-all}"

# Generate field context
FIELD_CONTEXT=$(generate_field_context "$ORG_SLUG_DETECTED" "$AUDIENCE" "$TAGS" || echo "")

if [ -z "$FIELD_CONTEXT" ]; then
    log_verbose "Failed to generate field context"
    emit_pretool_agent_noop
    exit 0
fi

# Build and display injection message
INJECTION_MSG=$(build_injection_message "$ORG_SLUG_DETECTED" "$NORMALIZED_AGENT" "$FIELD_CONTEXT")
echo "$INJECTION_MSG" >&2

# Inject field context into hook input
if command -v jq &>/dev/null; then
    # Build context preamble
    CONTEXT_PREAMBLE="[FIELD DICTIONARY: Use the following field definitions to understand field semantics, caveats, and recommended aggregations. Org: ${ORG_SLUG_DETECTED}]

## Field Reference

$FIELD_CONTEXT

---

"

    # Prepend context to prompt AND add field_dictionary_context object
    ENHANCED_INPUT=$(echo "$AGENT_INPUT_JSON" | jq \
        --arg contextPreamble "$CONTEXT_PREAMBLE" \
        --arg org "$ORG_SLUG_DETECTED" \
        --arg audience "${AUDIENCE:-all}" \
        --arg tags "${TAGS:-all}" \
        --arg dictPath "orgs/${ORG_SLUG_DETECTED}/configs/field-dictionary.yaml" \
        '.prompt = ($contextPreamble + (.prompt // "")) |
        . + {
            field_dictionary_context: {
                available: true,
                org: $org,
                audience: $audience,
                tags: $tags,
                dictionary_path: $dictPath,
                note: "Field context has been injected. Use field definitions for accurate reporting."
            }
        }'
    )
    emit_pretool_agent_update \
      "$ENHANCED_INPUT" \
      "Injected field dictionary context for ${ORG_SLUG_DETECTED}" \
      "FIELD_DICTIONARY_CONTEXT_INJECTED: Reporting guidance was added from the org field dictionary." \
      "FIELD_DICTIONARY_CONTEXT" \
      "INFO"
    exit 0
fi

# jq is required for structured updates; otherwise leave the tool input unchanged.
emit_pretool_agent_noop
exit 0
