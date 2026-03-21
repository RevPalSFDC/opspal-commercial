#!/bin/bash

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
HOOK_NAME="pre-task-agent-validator"
VERBOSE="${TASK_VALIDATOR_VERBOSE:-0}"

# Paths - use CLAUDE_PLUGIN_ROOT if available, fall back to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
AGENT_RESOLVER="$PLUGIN_ROOT/scripts/lib/agent-alias-resolver.js"
AGENT_TOOL_REGISTRY="$PLUGIN_ROOT/scripts/lib/agent-tool-registry.js"
CROSS_PLUGIN_COORDINATOR="$PLUGIN_ROOT/scripts/lib/cross-plugin-coordinator.js"
ROUTING_METRICS="$PLUGIN_ROOT/scripts/lib/routing-metrics.js"
COHORT_RUNBOOK_GUARD="$PLUGIN_ROOT/scripts/lib/cohort-runbook-guard.js"
ROUTING_STATE_MANAGER="$PLUGIN_ROOT/scripts/lib/routing-state-manager.js"
HOOK_EVENT_NORMALIZER="$PLUGIN_ROOT/scripts/lib/hook-event-normalizer.js"

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
CLAUDE_INTERNAL_AGENT_ALLOWLIST="${CLAUDE_INTERNAL_AGENT_ALLOWLIST:-statusline-setup}"

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
    local blocked="$4"
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
      --argjson blocked "$blocked" \
      --argjson duration_ms "$duration_ms" \
      '{
        type: "routing_decision",
        input: {
          agent: (if $input_agent != "" then $input_agent else null end)
        },
        output: {
          agent: (if $resolved_agent != "" then $resolved_agent else null end),
          wasResolved: $was_resolved,
          blocked: $blocked,
          blockReason: (if $block_reason != "" then $block_reason else null end)
        },
        metrics: {
          durationMs: $duration_ms
        },
        source: "pre-task-agent-validator",
        error: (if $error_msg != "" then { message: $error_msg } else empty end)
      }' 2>/dev/null || echo "{}")

    # Log asynchronously to avoid slowing down the hook
    (node "$ROUTING_METRICS" log "$event_json" >/dev/null 2>&1 &)
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

    if [[ -n "${session_key// }" ]] && [[ "$session_key" != "null" ]]; then
        printf '%s' "$session_key"
        return 0
    fi

    if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
        printf '%s' "$CLAUDE_SESSION_ID"
        return 0
    fi

    printf '%s' "default-session"
}

check_routing_requirement() {
    local session_key="$1"

    if [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &> /dev/null; then
        echo '{}'
        return 0
    fi

    node "$ROUTING_STATE_MANAGER" check "$session_key" 2>/dev/null || echo '{}'
}

mark_routing_requirement_cleared() {
    local session_key="$1"
    local resolved_agent="$2"

    if [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &> /dev/null; then
        return 0
    fi

    node "$ROUTING_STATE_MANAGER" mark-cleared "$session_key" "$resolved_agent" >/dev/null 2>&1 || true
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

apply_runbook_cohort_requirements() {
    local input_json="$1"
    local workspace_root
    workspace_root="$(cd "$PLUGIN_ROOT/../.." && pwd)"

    if [ "$RUNBOOK_COHORT_ENFORCEMENT" != "1" ]; then
        echo "$input_json"
        return 0
    fi

    if [ ! -f "$COHORT_RUNBOOK_GUARD" ]; then
        log "Cohort runbook guard not found, skipping runbook enforcement"
        echo "$input_json"
        return 0
    fi

    if ! command -v node &> /dev/null; then
        log "node not available, skipping runbook enforcement"
        echo "$input_json"
        return 0
    fi

    local analysis
    analysis=$(echo "$input_json" | node "$COHORT_RUNBOOK_GUARD" assess-task --workspace-root "$workspace_root" 2>/dev/null || echo "")

    if [ -z "$analysis" ] || ! echo "$analysis" | jq -e . >/dev/null 2>&1; then
        log "Cohort runbook guard analysis failed, skipping"
        echo "$input_json"
        return 0
    fi

    local cohort_count
    cohort_count=$(echo "$analysis" | jq -r '.matched_cohorts | length' 2>/dev/null || echo "0")

    if [ "$cohort_count" -eq 0 ]; then
        echo "$input_json"
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

    echo "$enriched_input"
    return 0
}

apply_subagent_permission_contract() {
    local input_json="$1"
    local resolved_agent="${2:-}"

    # Prefer metadata-driven tool detection from agent frontmatter/routing-index.
    # Keep the legacy fallback list for stale runtimes that have not refreshed
    # supporting helper files yet.
    local bash_required_agents='sfdc-data-operations|sfdc-query-specialist|sfdc-bulkops-orchestrator|sfdc-upsert-orchestrator|sfdc-deployment-manager|instance-deployer|marketo-data-operations|marketo-observability-orchestrator|hubspot-data-operations-manager'
    local requires_bash_contract="false"

    if [ -n "$resolved_agent" ] && [ -f "$AGENT_TOOL_REGISTRY" ] && node "$AGENT_TOOL_REGISTRY" has-tool "$resolved_agent" "Bash" "$PLUGIN_ROOT" >/dev/null 2>&1; then
        requires_bash_contract="true"
    elif [ -n "$resolved_agent" ] && echo "$resolved_agent" | grep -qiE "$bash_required_agents"; then
        requires_bash_contract="true"
    fi

    if [ -z "$resolved_agent" ] || [ "$requires_bash_contract" != "true" ]; then
        echo "$input_json"
        return 0
    fi

    local has_marker
    has_marker=$(echo "$input_json" | jq -r '(.prompt // "") | contains("SUBAGENT_BASH_PERMISSION_BLOCKED")' 2>/dev/null || echo "false")

    if [ "$has_marker" != "true" ]; then
        input_json=$(echo "$input_json" | jq '.prompt = ((.prompt // "") + "\n\n[PERMISSION CONTRACT]\nThis task requires Bash access for query/extraction workflows.\nIf Bash is permission-blocked in subagent context, do NOT claim API limitations.\nReturn this exact marker block and stop:\nSTATUS: SUBAGENT_BASH_PERMISSION_BLOCKED\nREQUIRED_TOOL: Bash\nNEXT_STEP: Parent context must execute required commands or rerun with Bash permission.\n")' 2>/dev/null || echo "$input_json")
    fi

    input_json=$(echo "$input_json" | jq -c '.permission_contract = {
        requiredTools: ["Bash"],
        fallbackMarker: "SUBAGENT_BASH_PERMISSION_BLOCKED",
        onPermissionBlock: "return_control_to_parent"
    }' 2>/dev/null || echo "$input_json")

    PERMISSION_FALLBACK_GUIDANCE="PERMISSION_HINT: '$resolved_agent' may require Bash access. If blocked, require explicit marker SUBAGENT_BASH_PERMISSION_BLOCKED and return control to parent context."

    echo "$input_json"
    return 0
}

is_claude_internal_helper_agent() {
    local agent_name="$1"
    local tool_input_json="${2:-{}}"
    local description=""
    local allowlist_value

    if [[ -z "$agent_name" ]] || [[ "$agent_name" == *:* ]]; then
        return 1
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

    prompt=$(echo "$input_json" | jq -r '[.prompt // "", .description // "", .message // ""] | join(" ")' 2>/dev/null || echo "")
    prompt=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')

    echo "$prompt" | grep -qiE 'sf[[:space:]]+project[[:space:]]+deploy|package\.xml|force-app|quick[[:space:]-]?action|layouts?([[:space:]]|$)|metadata deploy|deploy start|--source-dir|--manifest'
}

reroute_salesforce_deployment_specialist() {
    local resolved_agent="$1"
    local input_json="$2"
    local normalized_agent="${resolved_agent##*:}"

    if [[ "$normalized_agent" != "instance-deployer" ]]; then
        printf '%s' "$resolved_agent"
        return 0
    fi

    if is_salesforce_deploy_request "$input_json"; then
        printf '%s' "opspal-salesforce:sfdc-deployment-manager"
        return 0
    fi

    printf '%s' "$resolved_agent"
}

# Main validation logic
main() {
    log "Hook triggered"

    # Read hook input from stdin
    HOOK_INPUT=$(cat)

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

    local normalized_hook_input
    normalized_hook_input=$(printf '%s' "$HOOK_INPUT" | node "$HOOK_EVENT_NORMALIZER" 2>/dev/null || echo "{}")
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

    if is_claude_internal_helper_agent "$AGENT_NAME" "$TOOL_INPUT"; then
        log "Allowing Claude internal helper agent without plugin resolution: $AGENT_NAME"
        echo '{}'
        exit 0
    fi

    ADDITIONAL_CONTEXT=""
    SESSION_KEY=$(extract_session_key "$normalized_hook_input")

    log "Validating agent: $AGENT_NAME"

    # Step 1: Check for cross-type conflict (name exists as BOTH command AND agent)
    # This is the most important check - ambiguous names cause the most confusion
    IS_AMBIGUOUS=$(node "$AGENT_RESOLVER" is-ambiguous "$AGENT_NAME" 2>/dev/null || echo "false")

    if [ "$IS_AMBIGUOUS" = "true" ]; then
        # Get detailed info about the conflict
        AMBIG_INFO=$(node "$AGENT_RESOLVER" ambiguous-info "$AGENT_NAME" 2>/dev/null || true)

        log "Cross-type conflict detected: $AGENT_NAME"

        # Since user explicitly used the Agent tool, they likely want the agent
        # But we should warn them about the ambiguity
        ADDITIONAL_CONTEXT="WARN [ROUTING_AMBIGUOUS_NAME]: '$AGENT_NAME' exists as both command and agent. Since the Agent tool was used, proceeding with agent invocation. If command was intended, use Skill(skill='$AGENT_NAME') or /$AGENT_NAME. Prefer fully-qualified names like 'plugin:agent-name'."
        # Continue with agent resolution (don't exit)
    fi

    # Step 2: Check if this name is ONLY a COMMAND (not an agent)
    IS_COMMAND=$(node "$AGENT_RESOLVER" is-command "$AGENT_NAME" 2>/dev/null || echo "false")
    IS_AGENT=$(node "$AGENT_RESOLVER" resolve "$AGENT_NAME" 2>/dev/null || true)

    # Only block if it's a command but NOT an agent
    if [ "$IS_COMMAND" = "true" ] && [ -z "$IS_AGENT" ]; then
        # Get the correct invocation info
        COMMAND_INFO=$(node "$AGENT_RESOLVER" command-info "$AGENT_NAME" 2>/dev/null || true)

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
    set +e
    RESOLVED=$(node "$AGENT_RESOLVER" resolve "$AGENT_NAME" 2>/dev/null)
    RESOLVE_EXIT_CODE=$?
    set -e

    if [ $RESOLVE_EXIT_CODE -ne 0 ] || [ -z "$RESOLVED" ]; then
        # Agent not found - provide suggestions
        log_error "Agent '$AGENT_NAME' not found"

        # Get suggestions using the last part of the name
        SEARCH_TERM="${AGENT_NAME##*-}"
        SUGGESTIONS=$(node "$AGENT_RESOLVER" search "$SEARCH_TERM" 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//' || true)
        EXAMPLE_AGENTS=$(node "$AGENT_RESOLVER" list 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//' || true)

        # Log metric: agent not found
        log_routing_metric "$AGENT_NAME" "" "false" "true" "agent_not_found" "Agent not found in any plugin"

        emit_pretool_response \
          "deny" \
          "ROUTING_AGENT_NOT_FOUND: Agent '$AGENT_NAME' not found in any plugin. Suggestions: ${SUGGESTIONS:-none}. Use fully-qualified names like 'opspal-salesforce:sfdc-revops-auditor'. Generic role labels such as 'Explore' are not valid agent names. Valid agents include: ${EXAMPLE_AGENTS:-opspal-salesforce:sfdc-revops-auditor, opspal-salesforce:sfdc-cpq-assessor}." \
          "" \
          "" \
          "ROUTING_AGENT_NOT_FOUND" \
          "ERROR"
        exit 0
    fi

    REROUTED_AGENT=$(reroute_salesforce_deployment_specialist "$RESOLVED" "$TOOL_INPUT")
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

    # Step 4: Cross-plugin coordination check (P1-4)
    # Check if this is a cross-plugin invocation that needs validation
    if [ -f "$CROSS_PLUGIN_COORDINATOR" ] && [ -n "$RESOLVED" ]; then
        # Extract plugin from resolved name
        TARGET_PLUGIN="${RESOLVED%%:*}"

        # Check for known cross-plugin workflows
        WORKFLOW_INFO=$(node "$CROSS_PLUGIN_COORDINATOR" workflows --json 2>/dev/null | \
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
    FINAL_OUTPUT=$(apply_runbook_cohort_requirements "$FINAL_OUTPUT")

    # Step 5b: Inject permission fallback contract for Bash-required sub-agents
    FINAL_OUTPUT=$(apply_subagent_permission_contract "$FINAL_OUTPUT" "$RESOLVED")

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

    # Step 6: Clear or enforce pending routing requirements for this session.
    ROUTING_STATE=$(check_routing_requirement "$SESSION_KEY")
    ROUTING_PENDING=$(echo "$ROUTING_STATE" | jq -r '.pending // false' 2>/dev/null || echo "false")
    ROUTING_ENFORCE=$(echo "$ROUTING_STATE" | jq -r '.enforce // false' 2>/dev/null || echo "false")

    if [[ "$ROUTING_PENDING" == "true" ]] && [[ "$ROUTING_ENFORCE" == "true" ]]; then
        REQUIRED_AGENT=$(echo "$ROUTING_STATE" | jq -r '.recommendedAgent // ""' 2>/dev/null || echo "")
        CLEARANCE_AGENTS=$(echo "$ROUTING_STATE" | jq -c '.clearanceAgents // []' 2>/dev/null || echo "[]")
        ROUTE_ACTION=$(echo "$ROUTING_STATE" | jq -r '.action // ""' 2>/dev/null || echo "")

        if agent_clears_requirement "$RESOLVED" "$CLEARANCE_AGENTS"; then
            mark_routing_requirement_cleared "$SESSION_KEY" "$RESOLVED"
            if [ -n "$ADDITIONAL_CONTEXT" ]; then
                ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} ROUTING_REQUIREMENT_CLEARED: '$RESOLVED' satisfied pending route '${REQUIRED_AGENT:-unknown}'."
            else
                ADDITIONAL_CONTEXT="ROUTING_REQUIREMENT_CLEARED: '$RESOLVED' satisfied pending route '${REQUIRED_AGENT:-unknown}'."
            fi
        else
            local allowed_agents
            allowed_agents=$(echo "$CLEARANCE_AGENTS" | jq -r 'join(", ")' 2>/dev/null || echo "")
            log_routing_metric "$AGENT_NAME" "$RESOLVED" "false" "true" "routing_requirement_mismatch" "Pending route requires approved agent family"
            emit_pretool_response \
              "deny" \
              "ROUTING_REQUIRED_AGENT_MISMATCH: Pending route requires ${REQUIRED_AGENT:-an approved specialist}. Use the Agent tool with subagent_type='${REQUIRED_AGENT:-unknown}' or another approved family member: ${allowed_agents:-none}. Current action=${ROUTE_ACTION:-unknown}." \
              "" \
              "" \
              "ROUTING_REQUIRED_AGENT_MISMATCH" \
              "ERROR"
            exit 0
        fi
    fi

    if [ "$FINAL_OUTPUT" != "$TOOL_INPUT" ] || [ -n "$ADDITIONAL_CONTEXT" ]; then
        local reason_msg
        reason_msg="Agent validation passed"
        if [ "$FINAL_OUTPUT" != "$TOOL_INPUT" ]; then
            reason_msg="Resolved subagent_type '$AGENT_NAME' to '$RESOLVED'"
        fi
        emit_pretool_response \
          "allow" \
          "$reason_msg" \
          "$ADDITIONAL_CONTEXT" \
          "$FINAL_OUTPUT" \
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
