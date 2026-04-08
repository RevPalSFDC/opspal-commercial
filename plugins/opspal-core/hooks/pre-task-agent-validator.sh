#!/usr/bin/env bash

#
# Pre-Agent Validator Hook
#
# Validates and resolves agent names before Agent tool execution.
# This prevents two common routing errors:
#   1. Commands mistakenly invoked as agents (e.g., "reflect" should use Skill tool)
#   2. Short agent names not resolved to fully-qualified names
#
# Version: 1.0.0
# Date: 2026-01-22
#

# Strict mode for hook reliability
set -euo pipefail

# Configuration
# Hook debug support (all output to stderr)
if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

HOOK_NAME="pre-task-agent-validator"
VERBOSE="${TASK_VALIDATOR_VERBOSE:-0}"

# Paths - use CLAUDE_PLUGIN_ROOT if available, fall back to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
AGENT_RESOLVER="$PLUGIN_ROOT/scripts/lib/agent-alias-resolver.js"
AGENT_TOOL_REGISTRY="$PLUGIN_ROOT/scripts/lib/agent-tool-registry.js"
AGENT_BOOT_INTEGRITY_VALIDATOR="${AGENT_BOOT_INTEGRITY_VALIDATOR:-$PLUGIN_ROOT/scripts/lib/agent-boot-integrity-validator.js}"
CROSS_PLUGIN_COORDINATOR="$PLUGIN_ROOT/scripts/lib/cross-plugin-coordinator.js"
ROUTING_METRICS="$PLUGIN_ROOT/scripts/lib/routing-metrics.js"
COHORT_RUNBOOK_GUARD="$PLUGIN_ROOT/scripts/lib/cohort-runbook-guard.js"
ROUTING_STATE_MANAGER="$PLUGIN_ROOT/scripts/lib/routing-state-manager.js"
HOOK_EVENT_NORMALIZER="$PLUGIN_ROOT/scripts/lib/hook-event-normalizer.js"
SESSION_KEY_RESOLVER_LIB="$PLUGIN_ROOT/hooks/lib/session-key-resolver.sh"
ROUTING_CAPABILITY_RULES="$PLUGIN_ROOT/config/routing-capability-rules.json"
NODE_TIMEOUT_SECONDS="${PRE_TASK_AGENT_VALIDATOR_NODE_TIMEOUT_SECONDS:-2}"

# Log file for debugging
LOG_FILE="${TASK_VALIDATOR_LOG:-/tmp/task-validator-hook.log}"

# Metrics logging (P2-3)
ENABLE_ROUTING_METRICS="${ENABLE_ROUTING_METRICS:-1}"
START_TIME_MS=$(date +%s%3N 2>/dev/null || echo "0")

# Runbook cohort enforcement
RUNBOOK_COHORT_ENFORCEMENT="${RUNBOOK_COHORT_ENFORCEMENT:-1}"
RUNBOOK_COHORT_STRICT="${RUNBOOK_COHORT_STRICT:-0}"
RUNBOOK_ENFORCEMENT_MESSAGE=""
PERMISSION_FALLBACK_GUIDANCE=""
# DEPLOYMENT_PARENT_CONTEXT_GUIDANCE removed — deploy contract was removed
CLAUDE_INTERNAL_AGENT_ALLOWLIST="${CLAUDE_INTERNAL_AGENT_ALLOWLIST:-statusline-setup,Explore,Plan,General-purpose,Other,Bash,Claude Code Guide}"

# shellcheck source=/dev/null
source "$SESSION_KEY_RESOLVER_LIB"

run_node_with_timeout() {
    local timeout_seconds="$1"
    shift

    if command -v timeout >/dev/null 2>&1; then
        timeout "$timeout_seconds" node "$@"
        return $?
    fi

    node "$@"
}

# Function to log messages
log() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[${HOOK_NAME}] $1" >&2
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    fi
}

# Function to log errors (always visible)
log_error() {
    echo "[${HOOK_NAME}] ERROR: $1" >&2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE"
}

emit_pretool_response() {
    local permission_decision="${1:-}"
    local permission_reason="${2:-}"
    local additional_context="${3:-}"
    local updated_input_json="${4:-}"
    local code="${5:-ROUTING_VALIDATION}"
    local level="${6:-INFO}"

    if [[ -n "$updated_input_json" ]]; then
        jq -n \
          --arg decision "$permission_decision" \
          --arg reason "$permission_reason" \
          --arg context "$additional_context" \
          --arg code "$code" \
          --arg level "$level" \
          --argjson updated "$updated_input_json" \
          '{
            suppressOutput: true,
            hookSpecificOutput: (
              { hookEventName: "PreToolUse", updatedInput: $updated }
              + (if $decision != "" then { permissionDecision: $decision } else {} end)
              + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
              + (if $context != "" then { additionalContext: $context } else {} end)
            ),
            metadata: {
              routingValidation: {
                code: $code,
                level: $level,
                status: (if $decision == "deny" then "blocked" else "updated" end)
              }
            }
          }'
        return 0
    fi

    jq -n \
      --arg decision "$permission_decision" \
      --arg reason "$permission_reason" \
      --arg context "$additional_context" \
      --arg code "$code" \
      --arg level "$level" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          { hookEventName: "PreToolUse" }
          + (if $decision != "" then { permissionDecision: $decision } else {} end)
          + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
          + (if $context != "" then { additionalContext: $context } else {} end)
        ),
        metadata: {
          routingValidation: {
            code: $code,
            level: $level,
            status: (if $decision == "deny" then "blocked" else "advised" end)
          }
        }
      }'
}

# Function to log routing metrics (P2-3)
log_routing_metric() {
    local input_agent="$1"
    local resolved_agent="$2"
    local was_resolved="$3"
    local execution_block_until_cleared="$4"
    local block_reason="$5"
    local error_msg="$6"

    if [ "$ENABLE_ROUTING_METRICS" != "1" ]; then
        return 0
    fi

    if [ ! -f "$ROUTING_METRICS" ]; then
        log "Routing metrics module not found, skipping metrics"
        return 0
    fi

    # Calculate duration
    local end_time_ms=$(date +%s%3N 2>/dev/null || echo "0")
    local duration_ms=$((end_time_ms - START_TIME_MS))
    if [ "$duration_ms" -lt 0 ]; then
        duration_ms=0
    fi

    local event_json
    event_json=$(jq -n \
      --arg input_agent "$input_agent" \
      --arg resolved_agent "$resolved_agent" \
      --arg block_reason "$block_reason" \
      --arg error_msg "$error_msg" \
      --argjson was_resolved "$was_resolved" \
      --argjson execution_block_until_cleared "$execution_block_until_cleared" \
      --argjson duration_ms "$duration_ms" \
      '{
        type: "routing_decision",
        input: {
          agent: (if $input_agent != "" then $input_agent else null end)
        },
        output: {
          agent: (if $resolved_agent != "" then $resolved_agent else null end),
          wasResolved: $was_resolved,
          executionBlockUntilCleared: $execution_block_until_cleared,
          blockReason: (if $block_reason != "" then $block_reason else null end)
        },
        metrics: {
          durationMs: $duration_ms
        },
        source: "pre-task-agent-validator",
        error: (if $error_msg != "" then { message: $error_msg } else empty end)
      }' 2>/dev/null || echo "{}")

    # Log asynchronously to avoid slowing down the hook
    (run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_METRICS" log "$event_json" >/dev/null 2>&1 &)
}

extract_session_key() {
    local input_json="$1"
    local session_key=""

    session_key=$(echo "$input_json" | jq -r '
      .session_key
      // .sessionKey
      // .session_id
      // .sessionId
      // .context.session_key
      // .context.sessionKey
      // .context.session_id
      // .context.sessionId
      // ""
    ' 2>/dev/null || echo "")
    resolve_session_key_with_runtime_fallback "$session_key" "default-session" >&2
}

check_routing_requirement() {
    local session_key="$1"

    if [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &> /dev/null; then
        echo '{}'
        return 0
    fi

    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" check "$session_key" 2>/dev/null || echo '{}'
}

mark_routing_requirement_cleared() {
    local session_key="$1"
    local resolved_agent="$2"

    if [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &> /dev/null; then
        return 0
    fi

    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" mark-cleared "$session_key" "$resolved_agent" >/dev/null 2>&1 || true
}

clear_routing_requirement_for_explicit_override() {
    local session_key="$1"
    local resolved_agent="$2"

    if [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &> /dev/null; then
        echo '{}'
        return 0
    fi

    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" clear-explicit-override "$session_key" "$resolved_agent" 2>/dev/null || echo '{}'
}

agent_clears_requirement() {
    local resolved_agent="$1"
    local clearance_agents_json="$2"

    echo "$clearance_agents_json" | jq -e --arg agent "$resolved_agent" '
      if type != "array" then
        false
      else
        any(.[]; . == $agent)
      end
    ' >/dev/null 2>&1
}

# Extract platform family from a fully-qualified agent name for cross-family detection.
# e.g., opspal-salesforce:sfdc-discovery -> salesforce
extract_agent_family_sh() {
    local agent_name="$1"

    [[ -z "$agent_name" ]] && echo "" && return 0
    [[ "$agent_name" != *:* ]] && echo "" && return 0

    if [[ -f "$ROUTING_STATE_MANAGER" ]] && command -v node &>/dev/null; then
        local family
        family=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
const { extractAgentFamily } = require('$ROUTING_STATE_MANAGER');
process.stdout.write(extractAgentFamily('$agent_name') || '');
" 2>/dev/null) && echo "$family" && return 0
    fi

    # Pure-bash fallback
    local prefix="${agent_name%%:*}"
    echo "${prefix#opspal-}" >&2
}

derive_route_requirements() {
    local preferred_agent="$1"
    local clearance_agents_json="$2"

    if [[ -z "$preferred_agent" ]] || [[ ! -f "$AGENT_TOOL_REGISTRY" ]] || ! command -v node &> /dev/null; then
        echo '{}'
        return 0
    fi

    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_TOOL_REGISTRY" route-requirements "$preferred_agent" "$clearance_agents_json" "$PLUGIN_ROOT" 2>/dev/null || echo '{}'
}

agent_matches_route_requirements() {
    local resolved_agent="$1"
    local requirements_json="$2"

    if [[ -z "$resolved_agent" ]] || [[ -z "$requirements_json" ]] || [[ "$requirements_json" == "{}" ]]; then
        return 0
    fi

    if [[ ! -f "$AGENT_TOOL_REGISTRY" ]] || ! command -v node &> /dev/null; then
        return 0
    fi

    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_TOOL_REGISTRY" matches-requirements "$resolved_agent" "$requirements_json" "$PLUGIN_ROOT" >/dev/null 2>&1
}

resolve_route_repair_candidate() {
    local requirements_json="$1"
    local current_agent="${2:-}"
    local candidates_json="[]"

    if [[ -z "$requirements_json" ]] || [[ "$requirements_json" == "{}" ]]; then
        echo "" >&2
        return 0
    fi

    if [[ ! -f "$AGENT_TOOL_REGISTRY" ]] || ! command -v node &> /dev/null; then
        echo "" >&2
        return 0
    fi

    candidates_json=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_TOOL_REGISTRY" resolve-requirements "$requirements_json" "$PLUGIN_ROOT" 2>/dev/null || echo "[]")
    echo "$candidates_json" | jq -r --arg current "$current_agent" '
      if type != "array" then
        ""
      else
        (map(select(. != $current)) | .[0]) // ""
      end
    ' 2>/dev/null || echo ""
}

read_agent_metadata() {
    local resolved_agent="$1"

    if [[ -z "$resolved_agent" ]] || [[ ! -f "$AGENT_TOOL_REGISTRY" ]] || ! command -v node &> /dev/null; then
        echo '{}'
        return 0
    fi

    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_TOOL_REGISTRY" metadata "$resolved_agent" "$PLUGIN_ROOT" 2>/dev/null || echo '{}'
}

read_agent_boot_integrity_report() {
    local resolved_agent="$1"
    local payload_json="${2:-}"

    if [[ -z "$payload_json" ]]; then
        payload_json='{}'
    fi

    if [[ -z "$resolved_agent" ]] || [[ ! -f "$AGENT_BOOT_INTEGRITY_VALIDATOR" ]] || ! command -v node &> /dev/null; then
        echo '{}'
        return 0
    fi

    printf '%s' "$payload_json" | run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_BOOT_INTEGRITY_VALIDATOR" launch-report "$resolved_agent" "$PLUGIN_ROOT" 2>/dev/null || echo '{}'
}

apply_runbook_cohort_requirements() {
    local input_json="$1"
    local workspace_root
    workspace_root="$(cd "$PLUGIN_ROOT/../.." && pwd)"

    if [ "$RUNBOOK_COHORT_ENFORCEMENT" != "1" ]; then
        echo "$input_json" >&2
        return 0
    fi

    if [ ! -f "$COHORT_RUNBOOK_GUARD" ]; then
        log "Cohort runbook guard not found, skipping runbook enforcement"
        echo "$input_json" >&2
        return 0
    fi

    if ! command -v node &> /dev/null; then
        log "node not available, skipping runbook enforcement"
        echo "$input_json" >&2
        return 0
    fi

    local analysis
    analysis=$(echo "$input_json" | run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$COHORT_RUNBOOK_GUARD" assess-task --workspace-root "$workspace_root" 2>/dev/null || echo "")

    if [ -z "$analysis" ] || ! echo "$analysis" | jq -e . >/dev/null 2>&1; then
        log "Cohort runbook guard analysis failed, skipping"
        echo "$input_json" >&2
        return 0
    fi

    local cohort_count
    cohort_count=$(echo "$analysis" | jq -r '.matched_cohorts | length' 2>/dev/null || echo "0")

    if [ "$cohort_count" -eq 0 ]; then
        echo "$input_json" >&2
        return 0
    fi

    local enriched_input
    enriched_input=$(echo "$input_json" | jq --argjson requirements "$analysis" '.runbook_requirements = $requirements' 2>/dev/null || echo "$input_json")

    local guidance_text
    guidance_text=$(echo "$analysis" | jq -r '.guidance_text // empty' 2>/dev/null || echo "")

    if [ -n "$guidance_text" ]; then
        local has_marker
        has_marker=$(echo "$enriched_input" | jq -r '(.prompt // "") | contains("[RUNBOOK REQUIREMENTS]")' 2>/dev/null || echo "false")
        if [ "$has_marker" != "true" ]; then
            enriched_input=$(echo "$enriched_input" | jq --arg notes "$guidance_text" '.prompt = ((.prompt // "") + "\n\n[RUNBOOK REQUIREMENTS]\n" + $notes)' 2>/dev/null || echo "$enriched_input")
        fi
    fi

    local missing_count
    missing_count=$(echo "$analysis" | jq -r '.missing_artifacts | length' 2>/dev/null || echo "0")

    if [ "$missing_count" -gt 0 ]; then
        local missing_paths
        missing_paths=$(echo "$analysis" | jq -r '.missing_artifacts[].path' 2>/dev/null | paste -sd '; ' -)

        if [ "$RUNBOOK_COHORT_STRICT" = "1" ]; then
            RUNBOOK_ENFORCEMENT_MESSAGE="Missing runbook artifacts required for unresolved cohorts: ${missing_paths:-unknown}. Set RUNBOOK_COHORT_STRICT=0 to bypass temporarily."
            log_error "$RUNBOOK_ENFORCEMENT_MESSAGE"
        else
            log_error "Runbook cohort requirements detected with missing artifacts: ${missing_paths:-unknown}"
        fi
    else
        local matched
        matched=$(echo "$analysis" | jq -r '.matched_cohorts | join(", ")' 2>/dev/null || echo "")
        log "Runbook requirements injected for cohorts: $matched"
    fi

    echo "$enriched_input" >&2
    return 0
}

apply_subagent_permission_contract() {
    local input_json="$1"
    local resolved_agent="${2:-}"

    # Sub-agents inherit parent permissions per Claude Code docs.
    # The Bash permission contract is now opt-in only — it was causing
    # sub-agents to preemptively report SUBAGENT_BASH_PERMISSION_BLOCKED
    # even when Bash was actually available to them.
    # Enable with: export SUBAGENT_BASH_CONTRACT_ENABLED=1
    if [ "${SUBAGENT_BASH_CONTRACT_ENABLED:-0}" != "1" ]; then
        echo "$input_json" >&2
        return 0
    fi

    # Prefer metadata-driven tool detection from agent frontmatter/routing-index.
    # Keep the legacy fallback list for stale runtimes that have not refreshed
    # supporting helper files yet.
    local bash_required_agents='sfdc-data-operations|sfdc-query-specialist|sfdc-bulkops-orchestrator|sfdc-upsert-orchestrator|sfdc-deployment-manager|instance-deployer|marketo-data-operations|marketo-observability-orchestrator|hubspot-data-operations-manager'
    local requires_bash_contract="false"

    if [ -n "$resolved_agent" ] && [ -f "$AGENT_TOOL_REGISTRY" ] && run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_TOOL_REGISTRY" has-tool "$resolved_agent" "Bash" "$PLUGIN_ROOT" >/dev/null 2>&1; then
        requires_bash_contract="true"
    elif [ -n "$resolved_agent" ] && echo "$resolved_agent" | grep -qiE "$bash_required_agents"; then
        requires_bash_contract="true"
    fi

    if [ -z "$resolved_agent" ] || [ "$requires_bash_contract" != "true" ]; then
        echo "$input_json" >&2
        return 0
    fi

    local has_marker
    has_marker=$(echo "$input_json" | jq -r '(.prompt // "") | contains("SUBAGENT_BASH_PERMISSION_BLOCKED")' 2>/dev/null || echo "false")

    if [ "$has_marker" != "true" ]; then
        input_json=$(echo "$input_json" | jq '.prompt = ((.prompt // "") + "\n\n[PERMISSION CONTRACT]\nThis task requires Bash access for query/extraction workflows.\nIf Bash is permission-blocked in subagent context, do NOT claim API limitations and do NOT generate a parent handoff script by default.\nFirst use any declared non-Bash tools if they can complete the workflow.\nIf specialist execution is still impossible, return this exact marker block and stop:\nSTATUS: SUBAGENT_BASH_PERMISSION_BLOCKED\nREQUIRED_TOOL: Bash\nNEXT_STEP: Specialist execution is blocked by runtime tool restrictions; request internal specialist recovery instead of parent execution.\n")' 2>/dev/null || echo "$input_json")
    fi

    input_json=$(echo "$input_json" | jq -c '.permission_contract = {
        requiredTools: ["Bash"],
        fallbackMarker: "SUBAGENT_BASH_PERMISSION_BLOCKED",
        onPermissionBlock: "report_block_without_parent_handoff"
    }' 2>/dev/null || echo "$input_json")

    PERMISSION_FALLBACK_GUIDANCE="PERMISSION_HINT: '$resolved_agent' may require Bash access. If blocked, require explicit marker SUBAGENT_BASH_PERMISSION_BLOCKED and keep ownership inside the specialist path."

    echo "$input_json" >&2
    return 0
}

normalize_agent_label() {
    printf '%s' "$1" \
      | tr '[:upper:]' '[:lower:]' \
      | tr '_' '-' \
      | sed -E 's/[[:space:]]+/-/g'
}

is_claude_builtin_agent_name() {
    local normalized=""

    normalized="$(normalize_agent_label "$1")"

    case "$normalized" in
        explore|plan|general-purpose|other|bash|claude-code-guide|statusline-setup)
            return 0
            ;;
    esac

    return 1
}

collect_task_text() {
    echo "$1" | jq -r '[.prompt // "", .description // "", .message // ""] | join(" ")' 2>/dev/null || echo ""
}

    # is_deploy_planning_only_request() — REMOVED (was only used by deploy contract)
    # apply_deployment_parent_context_contract() — REMOVED
    # This function was injecting prompt instructions that told deployment
    # sub-agents not to execute sf project deploy, forcing a parent-context
    # handoff. Per Claude Code docs, sub-agents inherit parent permissions
    # and can use Bash if the parent allows it. The pre-deploy-agent-context-check.sh
    # hook already validates agent identity at the Bash tool level.
    # See: https://github.com/RevPalSFDC/opspal-commercial/issues/SUBAGENT-BASH-FIX

persist_parent_context_deploy_clearance() {
    local session_key="$1"
    local resolved_agent="${2:-}"
    local existing_state=""
    local has_existing_state="false"
    local requirements_json=""

    if [[ -z "$session_key" ]] || [[ -z "$resolved_agent" ]]; then
        return 0
    fi

    if [[ -f "$ROUTING_CAPABILITY_RULES" ]] && command -v jq &> /dev/null; then
        requirements_json="$(jq -c '
          .salesforce.deployPolicies.parent_clearance // {}
        ' "$ROUTING_CAPABILITY_RULES" 2>/dev/null || echo "{}")"
    fi

    if [[ -n "$requirements_json" ]] && [[ "$requirements_json" != "{}" ]] && [[ -f "$AGENT_TOOL_REGISTRY" ]] && command -v node &> /dev/null; then
        if ! run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_TOOL_REGISTRY" matches-requirements "$resolved_agent" "$requirements_json" "$PLUGIN_ROOT" >/dev/null 2>&1; then
            return 0
        fi
    else
        local normalized_agent="${resolved_agent##*:}"

        case "$normalized_agent" in
            release-coordinator|sfdc-deployment-manager|instance-deployer|sfdc-orchestrator|sfdc-metadata-manager)
                ;;
            *)
                return 0
                ;;
        esac
    fi

    if [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &> /dev/null; then
        return 0
    fi

    existing_state=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" get "$session_key" 2>/dev/null || echo '{"state":null}')
    has_existing_state=$(echo "$existing_state" | jq -r 'if has("state") then (.state != null) else true end' 2>/dev/null || echo "false")

    if [[ "$has_existing_state" == "true" ]]; then
        run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" mark-cleared "$session_key" "$resolved_agent" >/dev/null 2>&1 || true
        return 0
    fi

    jq -n \
      --arg session_key "$session_key" \
      --arg agent "$resolved_agent" \
      '{
        session_key: $session_key,
        required_agent: $agent,
        clearance_agents: [$agent],
        route_kind: "deployment_handoff",
        guidance_action: "recommend_specialist",
        routing_reason: "deployment_handoff",
        requires_specialist: false,
        prompt_guidance_only: true,
        prompt_blocked: false,
        execution_block_until_cleared: false,
        route_pending_clearance: false,
        route_cleared: true,
        routing_confidence: 1,
        clearance_status: "cleared",
        last_resolved_agent: $agent
      }' \
      | run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" save "$session_key" >/dev/null 2>&1 || true
}

is_claude_internal_helper_agent() {
    local agent_name="$1"
    local tool_input_json="${2:-}"
    local description=""
    local allowlist_value

    if [[ -z "$tool_input_json" ]]; then
        tool_input_json='{}'
    fi

    if [[ -z "$agent_name" ]] || [[ "$agent_name" == *:* ]]; then
        return 1
    fi

    if is_claude_builtin_agent_name "$agent_name"; then
        return 0
    fi

    description=$(echo "$tool_input_json" | jq -r '.description // .prompt // .message // ""' 2>/dev/null || echo "")
    allowlist_value=$(printf '%s' ",${CLAUDE_INTERNAL_AGENT_ALLOWLIST}," | tr '[:upper:]' '[:lower:]')

    if [[ "$allowlist_value" == *",${agent_name,,},"* ]]; then
        return 0
    fi

    if [[ "$agent_name" == "statusline-setup" ]] && [[ "$description" == *"Configure statusline setting"* ]]; then
        return 0
    fi

    return 1
}

is_salesforce_deploy_request() {
    local input_json="$1"
    local prompt=""

    prompt=$(collect_task_text "$input_json")
    prompt=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')

    if echo "$prompt" | grep -qiE '(sf|sfdx)[[:space:]]+project[[:space:]]+deploy|package\.xml|package xml|force-app|quick[[:space:]-]?action|layouts?([[:space:]]|$)|metadata deploy|deploy start|deploy validate|deploy preview|--source-dir|--manifest|target-org'; then
        return 0
    fi

    if echo "$prompt" | grep -qiE '(^|[^[:alnum:]_])(deploy|deployment|promote|release)([^[:alnum:]_]|$)' \
        && echo "$prompt" | grep -qiE 'salesforce|sfdc|metadata|flow|flows|layout|layouts|quick action|quickaction|validation rule|sandbox|production|manifest|package'; then
        return 0
    fi

    return 1
}

reroute_salesforce_deployment_specialist() {
    local resolved_agent="$1"
    local input_json="$2"
    local normalized_agent="${resolved_agent##*:}"

    if [[ "$normalized_agent" != "instance-deployer" ]]; then
        printf '%s' "$resolved_agent" >&2
        return 0
    fi

    if is_salesforce_deploy_request "$input_json"; then
        printf '%s' "opspal-salesforce:sfdc-deployment-manager" >&2
        return 0
    fi

    printf '%s' "$resolved_agent" >&2
}

# Main validation logic
main() {
    log "Hook triggered"

    # Read hook input from stdin
    HOOK_INPUT=$(cat 2>/dev/null || true)

    # Check if we have jq available
    if ! command -v jq &> /dev/null; then
        log "jq not available, skipping validation"
        echo '{}'
        exit 0
    fi

    # Check if agent resolver exists
    if [ ! -f "$AGENT_RESOLVER" ]; then
        log "Agent resolver not found at $AGENT_RESOLVER, skipping validation"
        echo '{}'
        exit 0
    fi

    if [ ! -f "$HOOK_EVENT_NORMALIZER" ]; then
        log "Hook event normalizer not found at $HOOK_EVENT_NORMALIZER, skipping validation"
        echo '{}'
        exit 0
    fi

    if ! command -v node &>/dev/null; then
        log "node not available, skipping agent validation"
        echo '{}'
        exit 0
    fi

    local normalized_hook_input
    normalized_hook_input=$(printf '%s' "$HOOK_INPUT" | run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$HOOK_EVENT_NORMALIZER" 2>/dev/null || echo "{}")
    if [[ -z "$normalized_hook_input" ]] || ! echo "$normalized_hook_input" | jq -e . >/dev/null 2>&1; then
        log "Could not normalize hook input, skipping"
        echo '{}'
        exit 0
    fi

    local tool_name
    tool_name=$(echo "$normalized_hook_input" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
    if [[ "$tool_name" != "Agent" ]]; then
        log "Non-Agent tool event, skipping"
        echo '{}'
        exit 0
    fi

    # Extract tool_input payload from hook input
    TOOL_INPUT=$(echo "$normalized_hook_input" | jq -c '.tool_input // {}' 2>/dev/null || echo "{}")
    if [[ "$TOOL_INPUT" == "{}" ]]; then
        log "No tool_input payload, skipping"
        echo '{}'
        exit 0
    fi

    # Extract subagent_type from the input
    AGENT_NAME=$(echo "$TOOL_INPUT" | jq -r '.subagent_type // empty' 2>/dev/null)

    if [ -z "$AGENT_NAME" ]; then
        log "No subagent_type specified, skipping"
        echo '{}'
        exit 0
    fi

    ADDITIONAL_CONTEXT=""
    SESSION_KEY="$(extract_session_key "$normalized_hook_input" 2>&1)"
    PENDING_ROUTING_STATE=$(check_routing_requirement "$SESSION_KEY")
    PENDING_ROUTE_ACTIVE=$(echo "$PENDING_ROUTING_STATE" | jq -r '.routePendingClearance // false' 2>/dev/null || echo "false")
    PENDING_EXECUTION_GATE=$(echo "$PENDING_ROUTING_STATE" | jq -r '.executionBlockActive // false' 2>/dev/null || echo "false")
    AUTO_DELEGATION_ACTIVE=$(echo "$PENDING_ROUTING_STATE" | jq -r '.autoDelegation.active // false' 2>/dev/null || echo "false")
    AUTO_DELEGATION_AGENT=$(echo "$PENDING_ROUTING_STATE" | jq -r '.autoDelegation.agent // .requiredAgent // ""' 2>/dev/null || echo "")
    FORCED_RESOLUTION=""
    ROUTING_AUTO_DELEGATED="false"

    if is_claude_internal_helper_agent "$AGENT_NAME" "$TOOL_INPUT"; then
        if [[ "$PENDING_ROUTE_ACTIVE" == "true" ]] &&
           [[ "$PENDING_EXECUTION_GATE" == "true" ]] &&
           [[ "$AUTO_DELEGATION_ACTIVE" == "true" ]] &&
           [[ -n "$AUTO_DELEGATION_AGENT" ]]; then
            log "Auto-delegating helper agent $AGENT_NAME -> $AUTO_DELEGATION_AGENT"
            FORCED_RESOLUTION="$AUTO_DELEGATION_AGENT"
            ROUTING_AUTO_DELEGATED="true"
            ADDITIONAL_CONTEXT="ROUTING_AUTO_DELEGATED: Pending mandatory route rewrote helper agent '$AGENT_NAME' to required specialist '$AUTO_DELEGATION_AGENT'."
        else
            log "Allowing Claude internal helper agent without plugin resolution: $AGENT_NAME"
            echo '{}'
            exit 0
        fi
    fi

    log "Validating agent: $AGENT_NAME"

    # Step 1: Check for cross-type conflict (name exists as BOTH command AND agent)
    # This is the most important check - ambiguous names cause the most confusion
    if [[ -n "$FORCED_RESOLUTION" ]]; then
        IS_AMBIGUOUS="false"
    else
        IS_AMBIGUOUS=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" is-ambiguous "$AGENT_NAME" 2>/dev/null || echo "false")
    fi

    if [ "$IS_AMBIGUOUS" = "true" ]; then
        # Get detailed info about the conflict
        AMBIG_INFO=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" ambiguous-info "$AGENT_NAME" 2>/dev/null || true)

        log "Cross-type conflict detected: $AGENT_NAME"

        # Since user explicitly used the Agent tool, they likely want the agent
        # But we should warn them about the ambiguity
        if [ -n "$ADDITIONAL_CONTEXT" ]; then
            ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} WARN [ROUTING_AMBIGUOUS_NAME]: '$AGENT_NAME' exists as both command and agent. Since the Agent tool was used, proceeding with agent invocation. If command was intended, use Skill(skill='$AGENT_NAME') or /$AGENT_NAME. Prefer fully-qualified names like 'plugin:agent-name'."
        else
            ADDITIONAL_CONTEXT="WARN [ROUTING_AMBIGUOUS_NAME]: '$AGENT_NAME' exists as both command and agent. Since the Agent tool was used, proceeding with agent invocation. If command was intended, use Skill(skill='$AGENT_NAME') or /$AGENT_NAME. Prefer fully-qualified names like 'plugin:agent-name'."
        fi
        # Continue with agent resolution (don't exit)
    fi

    # Step 2: Check if this name is ONLY a COMMAND (not an agent)
    if [[ -n "$FORCED_RESOLUTION" ]]; then
        IS_COMMAND="false"
        IS_AGENT="$FORCED_RESOLUTION"
    else
        IS_COMMAND=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" is-command "$AGENT_NAME" 2>/dev/null || echo "false")
        IS_AGENT=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" resolve "$AGENT_NAME" 2>/dev/null || true)
    fi

    # Only block if it's a command but NOT an agent
    if [ "$IS_COMMAND" = "true" ] && [ -z "$IS_AGENT" ]; then
        # Get the correct invocation info
        COMMAND_INFO=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" command-info "$AGENT_NAME" 2>/dev/null || true)

        log_error "'$AGENT_NAME' is a COMMAND, not an agent"

        # Log metric: command misrouted as agent
        log_routing_metric "$AGENT_NAME" "" "false" "true" "command_not_agent" "Name is a command, not an agent"

        emit_pretool_response \
          "deny" \
          "ROUTING_COMMAND_NOT_AGENT: '$AGENT_NAME' is a command, not an agent. Use Skill(skill='$AGENT_NAME'). Correction: $COMMAND_INFO" \
          "" \
          "" \
          "ROUTING_COMMAND_NOT_AGENT" \
          "ERROR"
        exit 0
    fi

    # Step 2: Resolve short name to fully-qualified name
    if [[ -n "$FORCED_RESOLUTION" ]]; then
        RESOLVED="$FORCED_RESOLUTION"
        RESOLVE_EXIT_CODE=0
    else
        set +e
        RESOLVED=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" resolve "$AGENT_NAME" 2>/dev/null)
        RESOLVE_EXIT_CODE=$?
        set -e
    fi

    if [ $RESOLVE_EXIT_CODE -ne 0 ] || [ -z "$RESOLVED" ]; then
        if [[ "$PENDING_ROUTE_ACTIVE" == "true" ]] &&
           [[ "$PENDING_EXECUTION_GATE" == "true" ]] &&
           [[ "$AUTO_DELEGATION_ACTIVE" == "true" ]] &&
           [[ -n "$AUTO_DELEGATION_AGENT" ]]; then
            log "Auto-delegating unresolved agent $AGENT_NAME -> $AUTO_DELEGATION_AGENT"
            RESOLVED="$AUTO_DELEGATION_AGENT"
            ROUTING_AUTO_DELEGATED="true"
            if [ -n "$ADDITIONAL_CONTEXT" ]; then
                ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_AUTO_DELEGATED: Pending mandatory route rewrote '$AGENT_NAME' to '$AUTO_DELEGATION_AGENT'."
            else
                ADDITIONAL_CONTEXT="ROUTING_AUTO_DELEGATED: Pending mandatory route rewrote '$AGENT_NAME' to '$AUTO_DELEGATION_AGENT'."
            fi
        else
        # Agent not found - provide suggestions
            log_error "Agent '$AGENT_NAME' not found"

        # Get suggestions using the last part of the name
            SEARCH_TERM="${AGENT_NAME##*-}"
            SUGGESTIONS=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" search "$SEARCH_TERM" 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//' || true)
            EXAMPLE_AGENTS=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$AGENT_RESOLVER" list 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//' || true)

        # Log metric: agent not found
            log_routing_metric "$AGENT_NAME" "" "false" "true" "agent_not_found" "Agent not found in any plugin"

            emit_pretool_response \
              "deny" \
              "ROUTING_AGENT_NOT_FOUND: Agent '$AGENT_NAME' not found in any plugin. Suggestions: ${SUGGESTIONS:-none}. Use fully-qualified names like 'opspal-salesforce:sfdc-revops-auditor' for OpsPal plugin agents. Claude Code built-in agents such as 'Explore' and 'Plan' are valid without plugin prefixes, but custom OpsPal agents must resolve to installed plugin identifiers. Valid OpsPal agents include: ${EXAMPLE_AGENTS:-opspal-salesforce:sfdc-revops-auditor, opspal-salesforce:sfdc-cpq-assessor}." \
              "" \
              "" \
              "ROUTING_AGENT_NOT_FOUND" \
              "ERROR"
            exit 0
        fi
    fi

    REROUTED_AGENT="$(reroute_salesforce_deployment_specialist "$RESOLVED" "$TOOL_INPUT" 2>&1)"
    if [ "$REROUTED_AGENT" != "$RESOLVED" ]; then
        log "Rerouted Salesforce deployment task: $RESOLVED -> $REROUTED_AGENT"
        if [ -n "$ADDITIONAL_CONTEXT" ]; then
            ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_SPECIALIST_OVERRIDE: Salesforce metadata deployments must use '$REROUTED_AGENT' instead of '$RESOLVED'."
        else
            ADDITIONAL_CONTEXT="ROUTING_SPECIALIST_OVERRIDE: Salesforce metadata deployments must use '$REROUTED_AGENT' instead of '$RESOLVED'."
        fi
        RESOLVED="$REROUTED_AGENT"
    fi

    # Step 3: If resolved name differs, update the tool input
    if [ "$RESOLVED" != "$AGENT_NAME" ]; then
        log "Resolved: $AGENT_NAME -> $RESOLVED"

        # Log metric: successful resolution
        log_routing_metric "$AGENT_NAME" "$RESOLVED" "true" "false" "" ""

        # Update the subagent_type in the tool input
        UPDATED_INPUT=$(echo "$TOOL_INPUT" | jq -c --arg resolved "$RESOLVED" '.subagent_type = $resolved')

        # Output a message to stderr so the user knows about the resolution
        echo "[RESOLVED] $AGENT_NAME -> $RESOLVED" >&2

        FINAL_OUTPUT="$UPDATED_INPUT"
    else
        # Already fully qualified, pass through unchanged
        log "Already fully qualified: $AGENT_NAME"

        # Log metric: passed through (already qualified)
        log_routing_metric "$AGENT_NAME" "$RESOLVED" "false" "false" "" ""

        FINAL_OUTPUT="$TOOL_INPUT"
    fi

    if [[ -f "$AGENT_BOOT_INTEGRITY_VALIDATOR" ]]; then
        BOOT_PAYLOAD="$FINAL_OUTPUT"
        if ! printf '%s' "$BOOT_PAYLOAD" | jq -e . >/dev/null 2>&1; then
            BOOT_PAYLOAD="$TOOL_INPUT"
        fi
        BOOT_PAYLOAD="$(printf '%s' "$BOOT_PAYLOAD" | jq -c . 2>/dev/null || echo '{}')"

        BOOT_REPORT=$(read_agent_boot_integrity_report "$RESOLVED" "$BOOT_PAYLOAD")
        if ! echo "$BOOT_REPORT" | jq -e . >/dev/null 2>&1; then
            log_routing_metric "$AGENT_NAME" "$RESOLVED" "false" "true" "agent_boot_integrity_validator_failed" "Boot integrity validator returned invalid output"
            # Advisory only — do not deny agent launches for routing/integrity checks
            emit_pretool_response \
              "allow" \
              "" \
              "AGENT_BOOT_INTEGRITY_WARNING: Launch validation for '$RESOLVED' returned invalid output from boot integrity validator. The agent will proceed but may have unresolved configuration issues." \
              "" \
              "AGENT_BOOT_INTEGRITY_WARNING" \
              "WARN"
            exit 0
        fi

        BOOT_PASS=$(echo "$BOOT_REPORT" | jq -r '.pass // false' 2>/dev/null || echo "false")
        if [[ "$BOOT_PASS" != "true" ]]; then
            BOOT_MESSAGE=$(echo "$BOOT_REPORT" | jq -r '.issues[0].message // "Agent boot integrity validation failed."' 2>/dev/null || echo "Agent boot integrity validation failed.")
            BOOT_FIELD=$(echo "$BOOT_REPORT" | jq -r '.issues[0].field // "unknown"' 2>/dev/null || echo "unknown")
            BOOT_SOURCE=$(echo "$BOOT_REPORT" | jq -r '.issues[0].sourceOfTruth // "unknown"' 2>/dev/null || echo "unknown")
            BOOT_REPAIR=$(echo "$BOOT_REPORT" | jq -r '.issues[0].repairAction // "Repair the agent markdown, imported prompt fragments, launch payload, or generated routing artifact before launch."' 2>/dev/null || echo "Repair the agent markdown, imported prompt fragments, launch payload, or generated routing artifact before launch.")
            BOOT_AGENT=$(echo "$BOOT_REPORT" | jq -r '.issues[0].agentId // empty' 2>/dev/null || echo "")

            log_routing_metric "$AGENT_NAME" "$RESOLVED" "false" "true" "agent_boot_integrity_error" "$BOOT_MESSAGE"
            # Advisory only — do not deny agent launches for routing/integrity checks
            emit_pretool_response \
              "allow" \
              "" \
              "AGENT_BOOT_INTEGRITY_WARNING: ${BOOT_MESSAGE} Agent: ${BOOT_AGENT:-$RESOLVED}. Missing/invalid field: ${BOOT_FIELD:-unknown}. Source of truth checked: ${BOOT_SOURCE:-unknown}. Suggested repair: ${BOOT_REPAIR}. The agent will proceed despite this validation issue." \
              "" \
              "AGENT_BOOT_INTEGRITY_WARNING" \
              "WARN"
            exit 0
        fi
    fi

    # Step 4: Cross-plugin coordination check (P1-4)
    # Check if this is a cross-plugin invocation that needs validation
    if [ -f "$CROSS_PLUGIN_COORDINATOR" ] && [ -n "$RESOLVED" ]; then
        # Extract plugin from resolved name
        TARGET_PLUGIN="${RESOLVED%%:*}"

        # Check for known cross-plugin workflows
        WORKFLOW_INFO=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$CROSS_PLUGIN_COORDINATOR" workflows --json 2>/dev/null | \
            jq -r --arg agent "$RESOLVED" '.[] | select(.steps[].agent == ($agent | split(":")[1])) | .name' 2>/dev/null | head -1 || true)

        if [ -n "$WORKFLOW_INFO" ]; then
            log "Agent is part of known workflow: $WORKFLOW_INFO"
        fi

        # For cross-plugin calls, log the dependency (informational only)
        if [ "$TARGET_PLUGIN" != "opspal-core" ]; then
            log "Cross-plugin invocation to: $TARGET_PLUGIN"
        fi
    fi

    # Step 5: Inject runbook cohort requirements before execution
    FINAL_OUTPUT="$(apply_runbook_cohort_requirements "$FINAL_OUTPUT" 2>&1)"

    # Step 5b: Deploy contract injection removed — sfdc-deployment-manager now has
    # adaptive Bash execution logic and pre-deploy-agent-context-check allows any
    # agent context via CLAUDE_TASK_ID. The hook injection was overriding the agent's
    # own behavior and creating a deadlock.

    # Step 5c: Inject permission fallback contract for Bash-required sub-agents
    FINAL_OUTPUT="$(apply_subagent_permission_contract "$FINAL_OUTPUT" "$RESOLVED" 2>&1)"

    # Strict mode: block with visible guidance when required runbook artifacts are missing
    if [ -n "$RUNBOOK_ENFORCEMENT_MESSAGE" ]; then
        log_routing_metric "$AGENT_NAME" "$RESOLVED" "false" "true" "runbook_artifacts_missing" "$RUNBOOK_ENFORCEMENT_MESSAGE"
        emit_pretool_response \
          "deny" \
          "RUNBOOK_ARTIFACTS_MISSING: $RUNBOOK_ENFORCEMENT_MESSAGE" \
          "" \
          "" \
          "RUNBOOK_ARTIFACTS_MISSING" \
          "ERROR"
        exit 0
    fi

    if [ -n "$PERMISSION_FALLBACK_GUIDANCE" ]; then
        if [ -n "$ADDITIONAL_CONTEXT" ]; then
            ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ${PERMISSION_FALLBACK_GUIDANCE}"
        else
            ADDITIONAL_CONTEXT="$PERMISSION_FALLBACK_GUIDANCE"
        fi
    fi

    # DEPLOYMENT_PARENT_CONTEXT_GUIDANCE removed — see Step 5b comment

    EXPLICIT_OVERRIDE_RESULT=$(clear_routing_requirement_for_explicit_override "$SESSION_KEY" "$RESOLVED")
    EXPLICIT_OVERRIDE_CLEARED=$(echo "$EXPLICIT_OVERRIDE_RESULT" | jq -r '.cleared // false' 2>/dev/null || echo "false")
    if [[ "$EXPLICIT_OVERRIDE_CLEARED" == "true" ]]; then
        EXPLICIT_OVERRIDE_REQUIRED=$(echo "$EXPLICIT_OVERRIDE_RESULT" | jq -r '.requiredAgent // ""' 2>/dev/null || echo "")
        if [ -n "$ADDITIONAL_CONTEXT" ]; then
            ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_EXPLICIT_OVERRIDE_CLEARED: Explicit agent '$RESOLVED' cleared pending route '${EXPLICIT_OVERRIDE_REQUIRED:-unknown}' because it is in the approved clearance family."
        else
            ADDITIONAL_CONTEXT="ROUTING_EXPLICIT_OVERRIDE_CLEARED: Explicit agent '$RESOLVED' cleared pending route '${EXPLICIT_OVERRIDE_REQUIRED:-unknown}' because it is in the approved clearance family."
        fi
    fi

    # Step 6: Clear or enforce pending routing requirements for this session.
    ROUTING_STATE=$(check_routing_requirement "$SESSION_KEY")
    ROUTING_PENDING=$(echo "$ROUTING_STATE" | jq -r '.routePendingClearance // false' 2>/dev/null || echo "false")
    ROUTING_ENFORCE=$(echo "$ROUTING_STATE" | jq -r '.executionBlockActive // false' 2>/dev/null || echo "false")

    if [[ "$ROUTING_PENDING" == "true" ]] && [[ "$ROUTING_ENFORCE" == "true" ]]; then
        REQUIRED_AGENT=$(echo "$ROUTING_STATE" | jq -r '.requiredAgent // ""' 2>/dev/null || echo "")
        CLEARANCE_AGENTS=$(echo "$ROUTING_STATE" | jq -c '.clearanceAgents // []' 2>/dev/null || echo "[]")
        ROUTE_ACTION=$(echo "$ROUTING_STATE" | jq -r '.guidanceAction // ""' 2>/dev/null || echo "")
        ROUTE_KIND=$(echo "$ROUTING_STATE" | jq -r '.routeKind // ""' 2>/dev/null || echo "")
        AUTO_DELEGATION_ACTIVE=$(echo "$ROUTING_STATE" | jq -r '.autoDelegation.active // false' 2>/dev/null || echo "false")
        AUTO_DELEGATION_AGENT=$(echo "$ROUTING_STATE" | jq -r '.autoDelegation.agent // .requiredAgent // ""' 2>/dev/null || echo "")
        ROUTE_REQUIREMENTS=$(derive_route_requirements "$REQUIRED_AGENT" "$CLEARANCE_AGENTS")

        if agent_clears_requirement "$RESOLVED" "$CLEARANCE_AGENTS"; then
            if ! agent_matches_route_requirements "$RESOLVED" "$ROUTE_REQUIREMENTS"; then
                local required_capabilities
                local allowed_actor_types
                local required_tools
                local actual_tools
                local repair_agent
                required_capabilities=$(echo "$ROUTE_REQUIREMENTS" | jq -r '.requiredCapabilities // [] | join(", ")' 2>/dev/null || echo "")
                allowed_actor_types=$(echo "$ROUTE_REQUIREMENTS" | jq -r '.allowedActorTypes // [] | join(", ")' 2>/dev/null || echo "")
                required_tools=$(echo "$ROUTE_REQUIREMENTS" | jq -r '.requiredTools // [] | join(", ")' 2>/dev/null || echo "")
                actual_tools=$(read_agent_metadata "$RESOLVED" | jq -r '.tools // [] | join(", ")' 2>/dev/null || echo "")
                repair_agent="$(resolve_route_repair_candidate "$ROUTE_REQUIREMENTS" "$RESOLVED" 2>&1)"

                if [[ -n "$repair_agent" ]]; then
                    local previous_resolved="$RESOLVED"
                    RESOLVED="$repair_agent"
                    FINAL_OUTPUT=$(echo "$FINAL_OUTPUT" | jq -c --arg resolved "$RESOLVED" '.subagent_type = $resolved')
                    log_routing_metric "$AGENT_NAME" "$RESOLVED" "true" "false" "routing_profile_repair" "Repaired routed specialist to matching profile"
                    if [ -n "$ADDITIONAL_CONTEXT" ]; then
                        ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_PROFILE_REPAIRED: '${previous_resolved}' did not satisfy the active route profile; rerouted to '${RESOLVED}'."
                    else
                        ADDITIONAL_CONTEXT="ROUTING_PROFILE_REPAIRED: '${previous_resolved}' did not satisfy the active route profile; rerouted to '${RESOLVED}'."
                    fi
                else
                    log_routing_metric "$AGENT_NAME" "$RESOLVED" "false" "true" "routing_profile_mismatch_advisory" "Resolved agent failed active route profile fit"
                    emit_pretool_response \
                      "allow" \
                      "ROUTING_ADVISORY_PROFILE_MISMATCH: Pending route suggests ${REQUIRED_AGENT:-an approved specialist} but '${RESOLVED}' does not match the active route profile. Consider using the suggested agent for best results. Required tools: ${required_tools:-none}. Actual tools: ${actual_tools:-none}. Required capabilities: ${required_capabilities:-none}. Eligible actor types: ${allowed_actor_types:-any}. [advisory-only: agent execution permitted]" \
                      "" \
                      "" \
                      "ROUTING_ADVISORY_PROFILE_MISMATCH" \
                      "WARN"
                    # Advisory only — do not exit; fall through to allow execution
                fi
            fi
            mark_routing_requirement_cleared "$SESSION_KEY" "$RESOLVED"
            if [ -n "$ADDITIONAL_CONTEXT" ]; then
                ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_REQUIREMENT_CLEARED: '$RESOLVED' satisfied pending route '${REQUIRED_AGENT:-unknown}'."
            else
                ADDITIONAL_CONTEXT="ROUTING_REQUIREMENT_CLEARED: '$RESOLVED' satisfied pending route '${REQUIRED_AGENT:-unknown}'."
            fi
        elif [[ "$AUTO_DELEGATION_ACTIVE" == "true" ]] && [[ -n "$AUTO_DELEGATION_AGENT" ]]; then
            local previous_resolved="$RESOLVED"
            local repair_agent=""
            RESOLVED="$AUTO_DELEGATION_AGENT"
            ROUTING_AUTO_DELEGATED="true"

            if ! agent_matches_route_requirements "$RESOLVED" "$ROUTE_REQUIREMENTS"; then
                repair_agent="$(resolve_route_repair_candidate "$ROUTE_REQUIREMENTS" "$RESOLVED" 2>&1)"
                if [[ -n "$repair_agent" ]]; then
                    local auto_delegated_resolved="$RESOLVED"
                    RESOLVED="$repair_agent"
                    if [ -n "$ADDITIONAL_CONTEXT" ]; then
                        ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_PROFILE_REPAIRED: '${auto_delegated_resolved}' did not satisfy the active route profile; rerouted to '${RESOLVED}'."
                    else
                        ADDITIONAL_CONTEXT="ROUTING_PROFILE_REPAIRED: '${auto_delegated_resolved}' did not satisfy the active route profile; rerouted to '${RESOLVED}'."
                    fi
                else
                    local required_capabilities
                    local allowed_actor_types
                    local required_tools
                    local actual_tools
                    required_capabilities=$(echo "$ROUTE_REQUIREMENTS" | jq -r '.requiredCapabilities // [] | join(", ")' 2>/dev/null || echo "")
                    allowed_actor_types=$(echo "$ROUTE_REQUIREMENTS" | jq -r '.allowedActorTypes // [] | join(", ")' 2>/dev/null || echo "")
                    required_tools=$(echo "$ROUTE_REQUIREMENTS" | jq -r '.requiredTools // [] | join(", ")' 2>/dev/null || echo "")
                    actual_tools=$(read_agent_metadata "$RESOLVED" | jq -r '.tools // [] | join(", ")' 2>/dev/null || echo "")
                    log_routing_metric "$AGENT_NAME" "$RESOLVED" "true" "true" "routing_auto_delegation_profile_mismatch" "Auto-delegated agent failed active route profile fit"
                    emit_pretool_response \
                      "deny" \
                      "ROUTING_AUTO_DELEGATION_PROFILE_MISMATCH: Pending ${ROUTE_KIND:-specialist} route attempted auto-delegation to '${RESOLVED}', but that agent does not satisfy the active route profile. Required tools: ${required_tools:-none}. Actual tools: ${actual_tools:-none}. Required capabilities: ${required_capabilities:-none}. Eligible actor types: ${allowed_actor_types:-any}." \
                      "" \
                      "" \
                      "ROUTING_AUTO_DELEGATION_PROFILE_MISMATCH" \
                      "ERROR"
                    exit 0
                fi
            fi

            FINAL_OUTPUT=$(echo "$FINAL_OUTPUT" | jq -c --arg resolved "$RESOLVED" '.subagent_type = $resolved')
            mark_routing_requirement_cleared "$SESSION_KEY" "$RESOLVED"
            log_routing_metric "$AGENT_NAME" "$RESOLVED" "true" "false" "" ""
            if [ -n "$ADDITIONAL_CONTEXT" ]; then
                ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_AUTO_DELEGATED: Pending ${ROUTE_KIND:-mandatory} route rewrote '$previous_resolved' to '$RESOLVED'. ROUTING_REQUIREMENT_CLEARED: '$RESOLVED' satisfied pending route '${REQUIRED_AGENT:-unknown}'."
            else
                ADDITIONAL_CONTEXT="ROUTING_AUTO_DELEGATED: Pending ${ROUTE_KIND:-mandatory} route rewrote '$previous_resolved' to '$RESOLVED'. ROUTING_REQUIREMENT_CLEARED: '$RESOLVED' satisfied pending route '${REQUIRED_AGENT:-unknown}'."
            fi
        else
            local allowed_agents
            local pending_family
            local requested_family
            local state_age_seconds
            local same_workflow_threshold=300  # 5 minutes, mirrors routing-state-manager.js default

            allowed_agents=$(echo "$CLEARANCE_AGENTS" | jq -r 'join(", ")' 2>/dev/null || echo "")
            pending_family="$(extract_agent_family_sh "${REQUIRED_AGENT:-}" 2>&1)"
            requested_family="$(extract_agent_family_sh "$RESOLVED" 2>&1)"
            state_age_seconds=$(echo "$ROUTING_STATE" | jq -r '.age // 0' 2>/dev/null || echo "0")

            # Defense-in-depth: detect cross-family stale carryover at enforcement time.
            # If the pending state's family differs from the requested agent's family AND
            # the state is older than the same-workflow threshold, treat it as stale
            # carryover and auto-clear rather than hard-blocking.
            if [[ -n "$pending_family" ]] &&
               [[ -n "$requested_family" ]] &&
               [[ "$pending_family" != "$requested_family" ]] &&
               [[ "$state_age_seconds" -ge "$same_workflow_threshold" ]]; then

                log_routing_metric "$AGENT_NAME" "$RESOLVED" "true" "false" \
                  "routing_stale_cross_family_carryover" \
                  "Stale cross-family route auto-cleared: pending=$pending_family, requested=$requested_family, age=${state_age_seconds}s"

                # Clear the stale state
                if [[ -f "$ROUTING_STATE_MANAGER" ]] && command -v node &>/dev/null; then
                    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" clear "$SESSION_KEY" >/dev/null 2>&1 || true
                fi

                if [ -n "$ADDITIONAL_CONTEXT" ]; then
                    ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_STALE_CROSS_FAMILY_CARRYOVER: Stale pending route for '${REQUIRED_AGENT:-unknown}' (family=${pending_family}) was auto-cleared; it was ${state_age_seconds}s old and does not apply to '${RESOLVED}' (family=${requested_family})."
                else
                    ADDITIONAL_CONTEXT="ROUTING_STALE_CROSS_FAMILY_CARRYOVER: Stale pending route for '${REQUIRED_AGENT:-unknown}' (family=${pending_family}) was auto-cleared; it was ${state_age_seconds}s old and does not apply to '${RESOLVED}' (family=${requested_family})."
                fi
                # Fall through - do NOT exit; let the agent proceed
            else
                # Same family or too recent to auto-clear as stale
                local mismatch_type
                if [[ -z "$pending_family" ]] || [[ -z "$requested_family" ]]; then
                    mismatch_type="unknown_family"
                elif [[ "$pending_family" == "$requested_family" ]]; then
                    mismatch_type="same_family_accepted"
                else
                    mismatch_type="cross_family_recent"  # different family but too recent to auto-clear
                fi

                # Same-family agents are acceptable substitutes.
                # A deploy that includes a permission set should be handled by
                # sfdc-deployment-manager, not blocked because routing matched
                # sfdc-permission-orchestrator on a keyword. Any agent in the
                # same plugin family can satisfy the route.
                if [[ "$mismatch_type" == "same_family_accepted" ]]; then
                    run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" \
                      mark-cleared "$SESSION_KEY" "$RESOLVED" >/dev/null 2>&1 || true

                    log_routing_metric "$AGENT_NAME" "$RESOLVED" "true" "false" \
                      "same_family_accepted" \
                      "Same-family agent accepted: '${RESOLVED}' (family=${requested_family}) satisfies pending route for '${REQUIRED_AGENT:-unknown}' (family=${pending_family})"

                    if [ -n "$ADDITIONAL_CONTEXT" ]; then
                        ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} SAME_FAMILY_ACCEPTED: '${RESOLVED}' accepted as same-family substitute for '${REQUIRED_AGENT:-unknown}'. Route cleared."
                    else
                        ADDITIONAL_CONTEXT="SAME_FAMILY_ACCEPTED: '${RESOLVED}' accepted as same-family substitute for '${REQUIRED_AGENT:-unknown}'. Route cleared."
                    fi
                    # Fall through - let the agent proceed
                else
                    # Cross-family recent: enforce strictly, but with circuit-breaker

                    # Deadlock circuit-breaker: record projection-loss event and check
                    # if repeated mismatches from different agents indicate a deadlock.
                    # If 2+ different agents have been denied, auto-clear and allow through.
                    local circuit_broken="false"
                    if [[ -f "$ROUTING_STATE_MANAGER" ]] && command -v node &>/dev/null; then
                        run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" \
                          record-projection-loss "$SESSION_KEY" "$RESOLVED" "agent_mismatch" >/dev/null 2>&1 || true

                        circuit_broken=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" \
                          check "$SESSION_KEY" 2>/dev/null | jq -r '.state.projection_loss_circuit_broken // false' 2>/dev/null || echo "false")
                    fi

                    if [[ "$circuit_broken" == "true" ]]; then
                        # Circuit-breaker triggered: auto-clear and reset projection-loss state
                        run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" \
                          mark-cleared "$SESSION_KEY" "$RESOLVED" >/dev/null 2>&1 || true
                        run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$ROUTING_STATE_MANAGER" \
                          reset-projection-loss "$SESSION_KEY" >/dev/null 2>&1 || true

                        log_routing_metric "$AGENT_NAME" "$RESOLVED" "true" "false" \
                          "deadlock_circuit_break" \
                          "Projection-loss circuit-breaker fired: 2+ different agents denied. Auto-clearing pending route and allowing '$RESOLVED' through. pending_family=${pending_family:-unknown}, requested_family=${requested_family:-unknown}"

                        if [ -n "$ADDITIONAL_CONTEXT" ]; then
                            ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} DEADLOCK_CIRCUIT_BREAK: Pending route for '${REQUIRED_AGENT:-unknown}' auto-cleared after repeated agent mismatches. '${RESOLVED}' is now allowed through."
                        else
                            ADDITIONAL_CONTEXT="DEADLOCK_CIRCUIT_BREAK: Pending route for '${REQUIRED_AGENT:-unknown}' auto-cleared after repeated agent mismatches. '${RESOLVED}' is now allowed through."
                        fi
                        # Fall through - let the agent proceed
                    else
                        log_routing_metric "$AGENT_NAME" "$RESOLVED" "false" "true" \
                          "routing_requirement_mismatch_advisory" \
                          "Pending route requires approved agent family. mismatch_type=${mismatch_type}, pending_family=${pending_family:-unknown}, requested_family=${requested_family:-unknown}"
                        emit_pretool_response \
                          "allow" \
                          "ROUTING_ADVISORY_AGENT_MISMATCH: Pending route suggests ${REQUIRED_AGENT:-an approved specialist}. For best results, use the Agent tool with subagent_type='${REQUIRED_AGENT:-unknown}' or another approved family member: ${allowed_agents:-none}. Current action=${ROUTE_ACTION:-unknown}. [pending_family=${pending_family:-unknown}, requested_family=${requested_family:-unknown}, mismatch_type=${mismatch_type}, advisory-only: agent execution permitted]" \
                          "" \
                          "" \
                          "ROUTING_ADVISORY_AGENT_MISMATCH" \
                          "WARN"
                        # Advisory only — do not exit; fall through to allow execution
                    fi
                fi
            fi
        fi
    fi

    persist_parent_context_deploy_clearance "$SESSION_KEY" "$RESOLVED"

    # Build minimal updatedInput with only the fields that actually changed.
    # Sending the full tool_input blob overwrites the prompt and injects extra
    # fields (runbook_requirements, permission_contract) that over-constrain
    # the sub-agent. Per Claude Code docs, only fields in updatedInput are modified.
    local minimal_update=""
    if [ "$RESOLVED" != "$AGENT_NAME" ]; then
        minimal_update=$(jq -nc --arg resolved "$RESOLVED" '{subagent_type: $resolved}')
    fi

    if [ -n "$minimal_update" ] || [ -n "$ADDITIONAL_CONTEXT" ]; then
        local reason_msg
        reason_msg="Agent validation passed"
        if [ -n "$minimal_update" ]; then
            reason_msg="Resolved subagent_type '$AGENT_NAME' to '$RESOLVED'"
        fi
        emit_pretool_response \
          "allow" \
          "$reason_msg" \
          "$ADDITIONAL_CONTEXT" \
          "$minimal_update" \
          "ROUTING_VALIDATED" \
          "INFO"
        exit 0
    fi

    echo '{}'
    exit 0
}

# Run main function
main || {
    # On failure, do not block tool execution.
    log_error "Hook failed, skipping validation"
    echo '{}'
    exit 0
}
