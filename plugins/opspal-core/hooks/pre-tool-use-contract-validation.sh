#!/bin/bash
#
# Pre-Tool Use Contract Validation Hook
# Validates tool inputs against registered contracts before execution
#
# Event: PreToolUse
# Timeout: 5000ms
#
# This hook intercepts tool calls and validates inputs against the
# central tool-contracts.json registry to prevent contract violations.
#

set -euo pipefail

is_json() {
    echo "$1" | jq -e . >/dev/null 2>&1
}

read_stdin_json() {
    local data=""
    if [ ! -t 0 ]; then
        data=$(cat)
    fi
    if [ -n "$data" ] && is_json "$data"; then
        echo "$data"
    else
        echo ""
    fi
}

# Get plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT_DEFAULT}"
if [ ! -f "$PLUGIN_ROOT/config/tool-contracts.json" ] && [ -f "$PLUGIN_ROOT_DEFAULT/config/tool-contracts.json" ]; then
    PLUGIN_ROOT="$PLUGIN_ROOT_DEFAULT"
fi
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd || pwd)"
CONTRACTS_FILE="${PLUGIN_ROOT}/config/tool-contracts.json"
VALIDATOR_SCRIPT="${PLUGIN_ROOT}/scripts/lib/tool-contract-validator.js"
ROUTING_STATE_MANAGER="${PLUGIN_ROOT}/scripts/lib/routing-state-manager.js"
MCP_TOOL_POLICY_CONFIG="${PLUGIN_ROOT}/config/mcp-tool-policies.json"
MCP_TOOL_POLICY_RESOLVER="${PLUGIN_ROOT}/scripts/lib/mcp-tool-policy-resolver.js"
HOOK_EVENT_NORMALIZER="${PLUGIN_ROOT}/scripts/lib/hook-event-normalizer.js"
DEFAULT_LOG_ROOT="${PROJECT_ROOT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_FILE="${LOG_ROOT}/tool-contract-validation.jsonl"
ROUTING_ENFORCEMENT_LOG="${LOG_ROOT}/routing-enforcement.jsonl"
ROUTING_REFLECTION_LOG="${LOG_ROOT}/routing-reflection-candidates.jsonl"
MCP_TOOL_POLICY_LOG="${LOG_ROOT}/mcp-tool-policy.jsonl"
# PreToolUse block semantics: exit 2 blocks tool execution.
HOOK_BLOCK_EXIT_CODE="${HOOK_BLOCK_EXIT_CODE:-2}"
DEFAULT_HARDENED_CHANNEL_ID="${OPSPAL_HARDENED_ENFORCED_CHANNEL_ID:-C0AGVQFDB18}"
BASH_BUDGET_ENABLED="${OPSPAL_BASH_BUDGET_ENABLED:-1}"
BASH_BUDGET_WINDOW_SECONDS="${OPSPAL_BASH_BUDGET_WINDOW_SECONDS:-180}"
BASH_BUDGET_MAX_COMMANDS="${OPSPAL_BASH_BUDGET_MAX_COMMANDS:-24}"
BASH_BUDGET_MAX_REPEATS="${OPSPAL_BASH_BUDGET_MAX_REPEATS:-5}"
BUDGET_STATE_DIR="${LOG_ROOT}/hook-state"
PENDING_ROUTE_MCP_POLICY='{}'
PENDING_ROUTE_MCP_POLICY_PENDING_ACTION=""
PENDING_ROUTE_MCP_POLICY_MUTABILITY=""
PENDING_ROUTE_MCP_POLICY_MATCHED=""
PENDING_ROUTE_MCP_POLICY_NOTE=""

# Parse tool name and input from stdin (or env fallback)
RAW_INPUT_DATA=$(read_stdin_json)

if [ -f "$HOOK_EVENT_NORMALIZER" ] && command -v node >/dev/null 2>&1; then
    if [ -n "$RAW_INPUT_DATA" ]; then
        INPUT_DATA=$(printf '%s' "$RAW_INPUT_DATA" | node "$HOOK_EVENT_NORMALIZER" 2>/dev/null || echo "")
    else
        INPUT_DATA=$(node "$HOOK_EVENT_NORMALIZER" 2>/dev/null || echo "")
    fi
else
    INPUT_DATA="$RAW_INPUT_DATA"
fi

if [ -z "$INPUT_DATA" ]; then
    TOOL_NAME_FALLBACK="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-}}"
    TOOL_INPUT_RAW="${CLAUDE_TOOL_INPUT:-${HOOK_TOOL_INPUT:-}}"

    if [ -z "$TOOL_NAME_FALLBACK" ] && [ -z "$TOOL_INPUT_RAW" ]; then
        echo '{"continue": true, "note": "No input data provided"}' >&2
        exit 0
    fi

    TOOL_INPUT_JSON="{}"
    if [ -n "$TOOL_INPUT_RAW" ]; then
        if is_json "$TOOL_INPUT_RAW" && [ "$(echo "$TOOL_INPUT_RAW" | jq -r 'type' 2>/dev/null || echo "")" = "object" ]; then
            TOOL_INPUT_JSON="$TOOL_INPUT_RAW"
        elif [ "$TOOL_NAME_FALLBACK" = "Bash" ]; then
            TOOL_INPUT_JSON=$(jq -nc --arg command "$TOOL_INPUT_RAW" '{command:$command}')
        fi
    fi

    INPUT_DATA=$(jq -nc \
        --arg tool "$TOOL_NAME_FALLBACK" \
        --argjson input "$TOOL_INPUT_JSON" \
        '{tool_name: $tool, tool_input: $input}')
fi

# Extract tool name
TOOL_NAME=$(echo "$INPUT_DATA" | jq -r '.tool_name // empty' 2>/dev/null)

if [ -z "$TOOL_NAME" ]; then
    echo '{"continue": true, "note": "Could not determine tool name"}' >&2
    exit 0
fi

append_jsonl_to_target() {
    local line="$1"
    local target_file="$2"
    local target_dir
    target_dir="$(dirname "$target_file")"

    mkdir -p "$target_dir" 2>/dev/null || return 1
    [ -w "$target_dir" ] || return 1
    printf '%s\n' "$line" >> "$target_file" 2>/dev/null || return 1
    return 0
}

safe_append_jsonl() {
    local line="$1"
    local target_file="$2"
    local fallback_file="${FALLBACK_LOG_ROOT}/$(basename "$target_file")"

    append_jsonl_to_target "$line" "$target_file" && return 0
    append_jsonl_to_target "$line" "$fallback_file" || true
    return 0
}

emit_routing_event() {
    local decision="$1"
    local rule_id="$2"
    local required_agent="$3"
    local reason="$4"
    local command="$5"
    local caller_agent="$6"
    local tool="$7"

    local sanitized_command
    sanitized_command="$(sanitize_command_for_log "$command")"

    local event
    event=$(jq -nc \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg decision "$decision" \
        --arg rule_id "$rule_id" \
        --arg required_agent "$required_agent" \
        --arg reason "$reason" \
        --arg command "$sanitized_command" \
        --arg caller_agent "$caller_agent" \
        --arg tool "$tool" \
        '{
            timestamp: $timestamp,
            decision: $decision,
            rule_id: $rule_id,
            required_agent: $required_agent,
            reason: $reason,
            command: $command,
            caller_agent: $caller_agent,
            tool: $tool
        }')

    safe_append_jsonl "$event" "$ROUTING_ENFORCEMENT_LOG"

    if [ "$decision" = "block" ] && [ "${ROUTING_REFLECTION_ON_BLOCK:-1}" = "1" ]; then
        safe_append_jsonl "$event" "$ROUTING_REFLECTION_LOG"
    fi
}

sanitize_command_for_log() {
    local raw="${1:-}"
    local sanitized="$raw"

    sanitized="$(printf '%s' "$sanitized" \
        | sed -E 's/([Aa]uthorization:[[:space:]]*[Bb]earer[[:space:]])[^[:space:]]+/\1[REDACTED]/g')"
    sanitized="$(printf '%s' "$sanitized" \
        | sed -E 's/\b([A-Za-z_][A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET|PAT))[[:space:]]*=[[:space:]]*[^[:space:];|&]+/\1=[REDACTED]/g')"

    printf '%s' "$sanitized" | tr '\n' ' ' | cut -c1-600
}

extract_channel_id() {
    echo "$INPUT_DATA" | jq -r '
        .context.channelId
        // .context.channel_id
        // .channelId
        // .channel_id
        // .event.params.channelId
        // .event.params.channel_id
        // .event.params.metadata.channel_id
        // ""
    ' 2>/dev/null
}

extract_session_key() {
    local extracted
    extracted="$(echo "$INPUT_DATA" | jq -r '
        .sessionKey
        // .session_key
        // .sessionId
        // .session_id
        // .context.sessionKey
        // .context.session_key
        // .context.sessionId
        // .context.session_id
        // ""
    ' 2>/dev/null)"

    if [ -n "$extracted" ] && [ "$extracted" != "null" ]; then
        echo "$extracted"
        return 0
    fi

    if [ -n "${CLAUDE_SESSION_ID:-}" ]; then
        echo "${CLAUDE_SESSION_ID}"
        return 0
    fi

    echo "unknown-session"
}

emit_pretool_decision() {
    local permission_decision="$1"
    local permission_reason="$2"
    local additional_context="${3:-}"

    jq -nc \
      --arg decision "$permission_decision" \
      --arg reason "$permission_reason" \
      --arg context "$additional_context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          { hookEventName: "PreToolUse" }
          + (if $decision != "" then { permissionDecision: $decision } else {} end)
          + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
          + (if $context != "" then { additionalContext: $context } else {} end)
        )
      }'
}

get_routing_state_check() {
    local session_key="$1"

    if [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &>/dev/null; then
        echo '{}'
        return 0
    fi

    node "$ROUTING_STATE_MANAGER" check "$session_key" 2>/dev/null || echo '{}'
}

classify_mcp_tool_policy() {
    local tool_name="$1"
    local policy_json=""

    if [[ -f "$MCP_TOOL_POLICY_RESOLVER" ]] && [[ -f "$MCP_TOOL_POLICY_CONFIG" ]] && command -v node &>/dev/null; then
        policy_json=$(MCP_TOOL_POLICY_CONFIG="$MCP_TOOL_POLICY_CONFIG" node "$MCP_TOOL_POLICY_RESOLVER" classify "$tool_name" 2>/dev/null || echo "")
    fi

    if [[ -z "$policy_json" ]] || ! echo "$policy_json" | jq -e . >/dev/null 2>&1; then
        policy_json=$(jq -nc \
          --arg tool "$tool_name" \
          '{
            tool: $tool,
            matched: false,
            policyId: null,
            namespace: "unknown",
            mutability: "unknown",
            pendingRouteAction: "deny",
            matchedPattern: null,
            notes: "Policy resolver unavailable; defaulting to deny while pending route is active."
          }')
    fi

    PENDING_ROUTE_MCP_POLICY="$policy_json"
    PENDING_ROUTE_MCP_POLICY_PENDING_ACTION=$(echo "$policy_json" | jq -r '.pendingRouteAction // "deny"' 2>/dev/null || echo "deny")
    PENDING_ROUTE_MCP_POLICY_MUTABILITY=$(echo "$policy_json" | jq -r '.mutability // "unknown"' 2>/dev/null || echo "unknown")
    PENDING_ROUTE_MCP_POLICY_MATCHED=$(echo "$policy_json" | jq -r '.matched // false' 2>/dev/null || echo "false")
    PENDING_ROUTE_MCP_POLICY_NOTE=$(echo "$policy_json" | jq -r '.notes // ""' 2>/dev/null || echo "")

    if [[ "$PENDING_ROUTE_MCP_POLICY_MATCHED" != "true" ]]; then
        local log_entry
        log_entry=$(echo "$policy_json" | jq -c --arg timestamp "$(date -Iseconds)" '
          . + {
            timestamp: $timestamp,
            eventType: "unknown_mcp_policy_fallback"
          }
        ' 2>/dev/null || echo "")
        if [[ -n "$log_entry" ]]; then
            safe_append_jsonl "$log_entry" "$MCP_TOOL_POLICY_LOG"
        fi
    fi
}

tool_requires_pending_route_clearance() {
    local tool_name="$1"

    case "$tool_name" in
        Agent|Read|Glob|Grep|LS|WebSearch|WebFetch|TaskList|TaskGet|TodoWrite|Skill)
            return 1
            ;;
        Bash|Write|Edit|MultiEdit)
            return 0
            ;;
        mcp__*|mcp_*)
            classify_mcp_tool_policy "$tool_name"
            if [[ "$PENDING_ROUTE_MCP_POLICY_PENDING_ACTION" == "allow" ]]; then
                return 1
            fi
            return 0
            ;;
    esac

    return 1
}

enforce_pending_route_gate() {
    local tool_name="$1"
    local session_key="$2"

    local routing_state
    routing_state=$(get_routing_state_check "$session_key")

    local pending enforce required_agent route_id action
    local clearance_agents command_summary additional_context
    pending=$(echo "$routing_state" | jq -r '.pending // false' 2>/dev/null || echo "false")
    enforce=$(echo "$routing_state" | jq -r '.enforce // false' 2>/dev/null || echo "false")

    if [[ "$pending" != "true" ]] || [[ "$enforce" != "true" ]]; then
        return 0
    fi

    if ! tool_requires_pending_route_clearance "$tool_name"; then
        return 0
    fi

    required_agent=$(echo "$routing_state" | jq -r '.recommendedAgent // ""' 2>/dev/null || echo "")
    clearance_agents=$(echo "$routing_state" | jq -r '.clearanceAgents // [] | join(", ")' 2>/dev/null || echo "")
    route_id=$(echo "$routing_state" | jq -r '.routeId // ""' 2>/dev/null || echo "")
    action=$(echo "$routing_state" | jq -r '.action // ""' 2>/dev/null || echo "")

    case "$tool_name" in
        Bash)
            command_summary="$(sanitize_command_for_log "$(extract_bash_command)")"
            ;;
        Write|Edit|MultiEdit)
            command_summary=$(echo "$INPUT_DATA" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null || echo "")
            ;;
        *)
            command_summary="$tool_name"
            ;;
    esac

    emit_routing_event \
      "block" \
      "${route_id:-pending-routing-required}" \
      "${required_agent:-unknown}" \
      "Pending routing requirement not cleared before operational tool execution." \
      "${command_summary:-$tool_name}" \
      "${CLAUDE_AGENT_NAME:-unknown}" \
      "$tool_name"

    additional_context="Routing requirement is still pending for this session."
    if [[ "$tool_name" == mcp__* || "$tool_name" == mcp_* ]]; then
        if [[ "$PENDING_ROUTE_MCP_POLICY_MATCHED" == "true" ]]; then
            additional_context="${additional_context} MCP policy: ${PENDING_ROUTE_MCP_POLICY_MUTABILITY:-unknown} via ${PENDING_ROUTE_MCP_POLICY_NOTE:-configured rule}."
        else
            additional_context="${additional_context} MCP tool mutability is not yet explicitly classified; defaulting to deny until this tool is added to the registry."
        fi
    fi

    emit_pretool_decision \
      "deny" \
      "ROUTING_REQUIRED_BEFORE_OPERATION: Use the Agent tool with subagent_type='${required_agent:-unknown}' before direct execution. Approved family: ${clearance_agents:-none}. Current action=${action:-unknown}." \
      "$additional_context"
    return 1
}

normalize_command_fingerprint() {
    printf '%s' "${1:-}" \
        | tr '\n' ' ' \
        | tr -s '[:space:]' ' ' \
        | sed -E 's/[0-9]{6,}/<num>/g' \
        | cut -c1-220
}

channel_in_hardening_scope() {
    local channel_id="$1"
    local enforced="${DEFAULT_HARDENED_CHANNEL_ID:-}"

    if [ -z "$enforced" ]; then
        return 0
    fi
    if [ -z "$channel_id" ]; then
        return 0
    fi

    local channel_upper enforced_upper
    channel_upper="$(printf '%s' "$channel_id" | tr '[:lower:]' '[:upper:]')"
    enforced_upper="$(printf '%s' "$enforced" | tr '[:lower:]' '[:upper:]')"
    [ "$channel_upper" = "$enforced_upper" ]
}

contains_inline_secret_literal() {
    local command="${1:-}"

    if printf '%s' "$command" | grep -Eqi 'authorization:[[:space:]]*bearer[[:space:]]+[A-Za-z0-9._~+/:-]{16,}'; then
        return 0
    fi

    if printf '%s' "$command" | grep -Eqi '[A-Za-z_][A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET|PAT)[[:space:]]*=[[:space:]]*[^$[:space:];|&]{8,}'; then
        return 0
    fi

    return 1
}

looks_like_broad_secret_discovery() {
    local command="${1:-}"

    if ! printf '%s' "$command" | grep -Eqi '(find[[:space:]]+/(home|Users)|find[[:space:]]+~|grep[[:space:]]+-r|grep[[:space:]]+-R)'; then
        return 1
    fi
    if ! printf '%s' "$command" | grep -Eqi '(\.env|token|secret|password|api[_-]?key|asana)'; then
        return 1
    fi

    return 0
}

enforce_bash_loop_budget() {
    local command="${1:-}"
    local channel_id session_key session_safe now state_file
    local window_start count last_fingerprint repeat_count fingerprint

    if [ "$BASH_BUDGET_ENABLED" != "1" ]; then
        return 0
    fi

    channel_id="$(extract_channel_id)"
    if ! channel_in_hardening_scope "$channel_id"; then
        return 0
    fi

    session_key="$(extract_session_key)"
    session_safe="$(printf '%s' "$session_key" | sed -E 's/[^A-Za-z0-9._-]+/_/g')"
    now="$(date +%s)"

    mkdir -p "$BUDGET_STATE_DIR" 2>/dev/null || mkdir -p "${FALLBACK_LOG_ROOT}/hook-state" 2>/dev/null || true
    state_file="${BUDGET_STATE_DIR}/bash-budget-${session_safe}.json"
    if [ ! -d "$BUDGET_STATE_DIR" ] || [ ! -w "$BUDGET_STATE_DIR" ]; then
        state_file="${FALLBACK_LOG_ROOT}/hook-state/bash-budget-${session_safe}.json"
    fi

    window_start=0
    count=0
    last_fingerprint=""
    repeat_count=0
    if [ -f "$state_file" ]; then
        window_start="$(jq -r '.window_start // 0' "$state_file" 2>/dev/null || echo 0)"
        count="$(jq -r '.count // 0' "$state_file" 2>/dev/null || echo 0)"
        last_fingerprint="$(jq -r '.last_fingerprint // ""' "$state_file" 2>/dev/null || true)"
        repeat_count="$(jq -r '.repeat_count // 0' "$state_file" 2>/dev/null || echo 0)"
    fi

    if [ "$window_start" -le 0 ] || [ $((now - window_start)) -gt "$BASH_BUDGET_WINDOW_SECONDS" ]; then
        window_start="$now"
        count=0
        repeat_count=0
        last_fingerprint=""
    fi

    count=$((count + 1))
    fingerprint="$(normalize_command_fingerprint "$command")"
    if [ "$fingerprint" = "$last_fingerprint" ] && [ -n "$fingerprint" ]; then
        repeat_count=$((repeat_count + 1))
    else
        repeat_count=1
        last_fingerprint="$fingerprint"
    fi

    jq -nc \
      --argjson window_start "$window_start" \
      --argjson count "$count" \
      --arg last_fingerprint "$last_fingerprint" \
      --argjson repeat_count "$repeat_count" \
      '{window_start:$window_start,count:$count,last_fingerprint:$last_fingerprint,repeat_count:$repeat_count}' \
      > "$state_file" 2>/dev/null || true

    if [ "$repeat_count" -gt "$BASH_BUDGET_MAX_REPEATS" ]; then
        echo "[GUARDRAIL BLOCKED] Repeated command pattern detected (${repeat_count} repeats)." >&2
        echo "Use a targeted command or provide a status + explicit missing input request." >&2
        return 1
    fi

    if [ "$count" -gt "$BASH_BUDGET_MAX_COMMANDS" ]; then
        echo "[GUARDRAIL BLOCKED] Bash command budget exceeded (${count} in ${BASH_BUDGET_WINDOW_SECONDS}s)." >&2
        echo "Pause and summarize findings before issuing additional shell commands." >&2
        return 1
    fi

    return 0
}

caller_matches_allowed_agents() {
    local caller_agent="$1"
    local approved_agents_json="$2"

    if [ -z "$caller_agent" ] || [ -z "$approved_agents_json" ]; then
        return 1
    fi

    echo "$approved_agents_json" | jq -e --arg agent "$caller_agent" '
      if type != "array" then
        false
      else
        any(.[]; . == $agent)
      end
    ' >/dev/null 2>&1
}

extract_bash_command() {
    echo "$INPUT_DATA" | jq -r '.tool_input.command // ""' 2>/dev/null
}

extract_soql_query_from_command() {
    local command="$1"
    local query=""

    # Support --query/-q with double-quoted SOQL (allows single quotes inside query).
    query=$(printf '%s\n' "$command" | sed -nE 's/.*--query[[:space:]]+"([^"]+)".*/\1/p' | head -1)
    if [ -z "$query" ]; then
        query=$(printf '%s\n' "$command" | sed -nE "s/.*--query[[:space:]]+'([^']+)'.*/\\1/p" | head -1)
    fi
    if [ -z "$query" ]; then
        query=$(printf '%s\n' "$command" | sed -nE 's/.*-q[[:space:]]+"([^"]+)".*/\1/p' | head -1)
    fi
    if [ -z "$query" ]; then
        query=$(printf '%s\n' "$command" | sed -nE "s/.*-q[[:space:]]+'([^']+)'.*/\\1/p" | head -1)
    fi

    echo "$query"
}

estimate_in_clause_items() {
    local query="$1"
    local in_list=""
    local count=0

    in_list=$(printf '%s\n' "$query" | sed -nE "s/.*[Ii][Nn][[:space:]]*\\(([^)]*)\\).*/\\1/p" | head -1)
    if [ -z "$in_list" ]; then
        echo "0"
        return 0
    fi

    count=$(printf '%s\n' "$in_list" | awk -F',' '{print NF}' 2>/dev/null || echo "0")
    echo "${count:-0}"
}

# Map Claude tool names to contract names
map_tool_to_contract() {
    local tool="$1"
    case "$tool" in
        "Bash")
            # Check if it's a Salesforce CLI command
            local cmd
            cmd=$(extract_bash_command)
            if [[ "$cmd" =~ ^sf\ data\ query ]]; then
                echo "sf-data-query"
            elif [[ "$cmd" =~ ^sf\ project\ deploy ]]; then
                echo "sf-project-deploy"
            elif [[ "$cmd" =~ ^sf\ data\ export|^sf\ data\ import ]]; then
                echo "sf-bulk-api"
            elif [[ "$cmd" =~ npx[[:space:]]+md-to-pdf|npx[[:space:]]+@mermaid-js/mermaid-cli ]]; then
                echo "pdf-direct-invocation"
            else
                echo "bash-command"
            fi
            ;;
        "Read"|"Write"|"Edit")
            echo "file-operation"
            ;;
        "mcp__salesforce__*"|"mcp_salesforce_*")
            if [[ "$tool" =~ query ]]; then
                echo "sf-data-query"
            elif [[ "$tool" =~ deploy ]]; then
                echo "sf-project-deploy"
            else
                echo "salesforce-api"
            fi
            ;;
        "mcp__hubspot__*"|"mcp_hubspot_*")
            echo "hubspot-api"
            ;;
        *)
            echo "$tool"
            ;;
    esac
}

CONTRACT_NAME=$(map_tool_to_contract "$TOOL_NAME")
SESSION_KEY="$(extract_session_key)"

if ! enforce_pending_route_gate "$TOOL_NAME" "$SESSION_KEY"; then
    exit 0
fi

# ============================================================================
# MANDATORY ROUTING ENFORCEMENT
# Blocks direct high-risk workflows that have mandatory specialist agents.
# ============================================================================

enforce_mandatory_routing() {
    local tool="$1"
    local caller_agent="${CLAUDE_AGENT_NAME:-${CLAUDE_SUBAGENT_NAME:-unknown}}"
    local command=""
    local command_lower=""
    local required_agent=""
    local approved_agents_json="[]"
    local approved_agents_display=""
    local reason=""
    local rule_id=""

    if [ "${ROUTING_ENFORCEMENT_ENABLED:-1}" = "0" ]; then
        return 0
    fi

    case "$tool" in
        "Bash")
            command="$(extract_bash_command)"
            command_lower=$(echo "$command" | tr '[:upper:]' '[:lower:]')

            # Rule 1: Permission/security write operations -> dedicated permission/security agents
            if echo "$command_lower" | grep -qE 'sf[[:space:]]+org[[:space:]]+(assign|user)[[:space:]]+perm(set|ission)'; then
                rule_id="sf_permission_security_write"
                required_agent="opspal-salesforce:sfdc-security-admin"
                approved_agents_json='["opspal-salesforce:sfdc-security-admin","opspal-salesforce:sfdc-permission-orchestrator","opspal-salesforce:sfdc-permission-assessor"]'
                reason="Direct Salesforce permission/security write detected."
            elif echo "$command_lower" | grep -qE 'sf[[:space:]]+data[[:space:]]+(create|update|upsert|delete|record[[:space:]]+create|record[[:space:]]+update|record[[:space:]]+upsert|record[[:space:]]+delete)'; then
                if echo "$command" | grep -qiE 'PermissionSetAssignment|PermissionSetGroupAssignment|PermissionSetLicenseAssign|PermissionSetGroup|PermissionSet|MutingPermissionSet|ObjectPermissions|FieldPermissions|SetupEntityAccess|UserRole|Profile'; then
                    rule_id="sf_permission_security_write"
                    required_agent="opspal-salesforce:sfdc-security-admin"
                    approved_agents_json='["opspal-salesforce:sfdc-security-admin","opspal-salesforce:sfdc-permission-orchestrator","opspal-salesforce:sfdc-permission-assessor"]'
                    reason="Direct Salesforce permission/security write detected."
                fi
            fi

            # Rule 2: Lead/Contact/Account upsert-import workflows -> upsert orchestrator
            if [ -z "$rule_id" ] && echo "$command_lower" | grep -qE 'sf[[:space:]]+data[[:space:]]+(upsert|import|create|update|bulk[[:space:]]+upsert)'; then
                if echo "$command" | grep -qiE '(^|[[:space:]])(Lead|Contact|Account)([[:space:]]|$)|--sobject[[:space:]]+(Lead|Contact|Account)'; then
                    rule_id="sf_core_object_upsert"
                    required_agent="opspal-salesforce:sfdc-upsert-orchestrator"
                    approved_agents_json='["opspal-salesforce:sfdc-upsert-orchestrator"]'
                    reason="Direct lead/contact/account upsert-import workflow detected."
                fi
            fi

            # Rule 2b: Core object data queries -> data operations/query specialist
            # Prevents shell parsing pitfalls (e.g., "!=" history expansion) and fragile direct JSON parsing.
            if [ -z "$rule_id" ] && echo "$command_lower" | grep -qE 'sf[[:space:]]+data[[:space:]]+query'; then
                local soql_query=""
                local safe_url_threshold="${SOQL_URL_SAFE_LENGTH_THRESHOLD:-6000}"
                local in_clause_threshold="${SOQL_IN_CLAUSE_ITEM_THRESHOLD:-200}"
                local command_length=0
                local query_length=0
                local in_clause_count=0

                soql_query=$(extract_soql_query_from_command "$command")
                command_length=${#command}
                query_length=${#soql_query}
                if [ -n "$soql_query" ]; then
                    in_clause_count=$(estimate_in_clause_items "$soql_query")
                else
                    in_clause_count=$(estimate_in_clause_items "$command")
                fi

                # Rule 2b1: Query length / IN-clause size likely to exceed URL limits (HTTP 431)
                if [ "$query_length" -gt "$safe_url_threshold" ] || [ "$command_length" -gt "$safe_url_threshold" ] || [ "$in_clause_count" -gt "$in_clause_threshold" ]; then
                    rule_id="sf_query_url_length_risk"
                    required_agent="opspal-salesforce:sfdc-bulkops-orchestrator"
                    approved_agents_json='["opspal-salesforce:sfdc-bulkops-orchestrator","opspal-salesforce:sfdc-query-specialist","opspal-salesforce:sfdc-data-operations","opspal-salesforce:sfdc-data-export-manager"]'
                    reason="SOQL query likely exceeds safe URL limits (command_len=$command_length query_len=$query_length in_items=$in_clause_count). Use chunked/bulk extraction workflow."
                fi
            fi

            if [ -z "$rule_id" ] && echo "$command_lower" | grep -qE 'sf[[:space:]]+data[[:space:]]+query'; then
                if echo "$command" | grep -qiE 'from[[:space:]]+(Lead|Contact|Account|Opportunity|Case)\b'; then
                    rule_id="sf_core_object_query"
                    required_agent="opspal-salesforce:sfdc-data-operations"
                    approved_agents_json='["opspal-salesforce:sfdc-data-operations","opspal-salesforce:sfdc-query-specialist","opspal-salesforce:sfdc-upsert-orchestrator","opspal-salesforce:sfdc-bulkops-orchestrator"]'
                    reason="Direct Salesforce core-object data query detected."
                fi
            fi

            # Rule 3: Territory model write workflows -> territory orchestrator/deployment agents
            if [ -z "$rule_id" ] && echo "$command_lower" | grep -qE 'sf[[:space:]]+data[[:space:]]+(create|update|upsert|delete)|sf[[:space:]]+project[[:space:]]+deploy'; then
                if echo "$command" | grep -qiE 'Territory2|Territory2Model|Territory2Type|UserTerritory2Association|ObjectTerritory2Association'; then
                    rule_id="sf_territory_write"
                    required_agent="opspal-salesforce:sfdc-territory-orchestrator"
                    approved_agents_json='["opspal-salesforce:sfdc-territory-orchestrator","opspal-salesforce:sfdc-territory-deployment","opspal-salesforce:sfdc-territory-monitor"]'
                    reason="Direct Salesforce territory write workflow detected."
                fi
            fi

            # Rule 4: Validation rule write/deploy workflows -> validation-rule orchestrator
            if [ -z "$rule_id" ] && echo "$command_lower" | grep -qE 'sf[[:space:]]+data[[:space:]]+(create|update|upsert|delete)|sf[[:space:]]+project[[:space:]]+deploy'; then
                if echo "$command" | grep -qiE 'ValidationRule|validation[._ -]?rule'; then
                    rule_id="sf_validation_rule_write"
                    required_agent="opspal-salesforce:validation-rule-orchestrator"
                    approved_agents_json='["opspal-salesforce:validation-rule-orchestrator"]'
                    reason="Direct Salesforce validation rule write workflow detected."
                fi
            fi

            # Permission/security reads are warning-only guidance
            if [ -z "$rule_id" ] && echo "$command_lower" | grep -qE 'sf[[:space:]]+data[[:space:]]+query'; then
                if echo "$command" | grep -qiE 'PermissionSetAssignment|PermissionSetGroupAssignment|PermissionSetLicenseAssign|PermissionSetGroup|PermissionSet|MutingPermissionSet|ObjectPermissions|FieldPermissions|SetupEntityAccess|UserRole|Profile'; then
                    emit_routing_event "warn" "sf_permission_security_query" "opspal-salesforce:sfdc-permission-assessor" "Permission/security query detected." "$command" "$caller_agent" "$tool"
                    echo "[ROUTING WARNING] Permission/security query detected. Prefer the Agent tool with subagent_type='opspal-salesforce:sfdc-permission-assessor'." >&2
                    return 0
                fi
            fi
            ;;
    esac

    # Enforce blocking when a mandatory rule matched and caller is not approved
    if [ -n "$rule_id" ]; then
        approved_agents_display=$(echo "$approved_agents_json" | jq -r 'join(", ")' 2>/dev/null || echo "")

        if caller_matches_allowed_agents "$caller_agent" "$approved_agents_json"; then
            emit_routing_event "allow" "$rule_id" "$required_agent" "$reason" "$command" "$caller_agent" "$tool"
            return 0
        fi

        emit_routing_event "block" "$rule_id" "$required_agent" "$reason" "$command" "$caller_agent" "$tool"
        emit_pretool_decision \
          "deny" \
          "ROUTING_SPECIALIST_REQUIRED: $reason Use the Agent tool with subagent_type='${required_agent}' before direct execution. Approved family: ${approved_agents_display:-$required_agent}." \
          "Direct operational workflow blocked until an approved specialist agent is used."
        return 1
    fi

    return 0
}

# ============================================================================
# API TYPE ROUTING CHECK (Salesforce-specific)
# Suggests better API alternatives before execution
# ============================================================================

check_api_routing() {
    local tool="$1"
    local input_json="$2"

    # Skip if disabled
    if [ "${SF_API_ROUTING_ENABLED:-1}" = "0" ]; then
        return 0
    fi

    # API router script location (in salesforce-plugin)
    local SFDC_PLUGIN="${PLUGIN_ROOT}/../salesforce-plugin"
    local API_ROUTER="${SFDC_PLUGIN}/scripts/lib/api-type-router.js"

    # Skip if router not found
    if [ ! -f "$API_ROUTER" ]; then
        return 0
    fi

    local suggestion=""

    case "$tool" in
        "Bash")
            # Extract command from input
            local cmd=$(echo "$input_json" | jq -r '.tool_input.command // ""' 2>/dev/null)

            # Only check Salesforce CLI commands
            if [[ "$cmd" =~ ^sf\ (data|project|apex|api) ]]; then
                suggestion=$(node "$API_ROUTER" check "$cmd" 2>/dev/null || true)
            fi
            ;;

        mcp__salesforce*|mcp_salesforce*)
            # Check MCP Salesforce tools
            local params=$(echo "$input_json" | jq -c '.tool_input // {}' 2>/dev/null)

            # Build a pseudo-command for the router
            local pseudo_cmd="sf data query"
            if [[ "$tool" =~ query ]]; then
                local query=$(echo "$params" | jq -r '.query // .soql // ""' 2>/dev/null)
                if [ -n "$query" ]; then
                    pseudo_cmd="sf data query \"$query\""
                fi
            elif [[ "$tool" =~ deploy ]]; then
                pseudo_cmd="sf project deploy"
            elif [[ "$tool" =~ create|update|upsert ]]; then
                local count=$(echo "$params" | jq -r '.records | length // 1' 2>/dev/null)
                pseudo_cmd="sf data create --records=$count"
            fi

            suggestion=$(node "$API_ROUTER" check "$pseudo_cmd" 2>/dev/null || true)
            ;;
    esac

    # Output suggestion if found
    if [ -n "$suggestion" ] && [ "$suggestion" != "null" ]; then
        echo "" >&2
        echo "┌─────────────────────────────────────────────────────────────┐" >&2
        echo "│ 🔀 API ROUTING SUGGESTION                                    │" >&2
        echo "├─────────────────────────────────────────────────────────────┤" >&2
        echo "│ $suggestion" >&2
        echo "└─────────────────────────────────────────────────────────────┘" >&2
        echo "" >&2

        # Log the suggestion
        local log_entry=$(jq -nc \
            --arg tool "$tool" \
            --arg suggestion "$suggestion" \
            --arg timestamp "$(date -Iseconds)" \
            '{timestamp: $timestamp, type: "api_routing", tool: $tool, suggestion: $suggestion}')
        safe_append_jsonl "$log_entry" "$LOG_FILE"
    fi
}

# Run hardened guardrails before routing/contract checks
if [ "$TOOL_NAME" = "Bash" ]; then
    TOOL_COMMAND="$(extract_bash_command)"
    CHANNEL_ID_SCOPE="$(extract_channel_id)"

    if channel_in_hardening_scope "$CHANNEL_ID_SCOPE"; then
        if contains_inline_secret_literal "$TOOL_COMMAND"; then
            echo "[GUARDRAIL BLOCKED] Inline secret literal detected. Use environment-backed credentials only." >&2
            echo "Reference approved secrets via \$VARNAME instead of pasting token values directly." >&2
            exit "$HOOK_BLOCK_EXIT_CODE"
        fi

        if looks_like_broad_secret_discovery "$TOOL_COMMAND"; then
            echo "[GUARDRAIL BLOCKED] Broad credential discovery pattern detected." >&2
            echo "Use scoped, org-approved credential sources instead of recursive home-directory scans." >&2
            exit "$HOOK_BLOCK_EXIT_CODE"
        fi
    fi

    if ! enforce_bash_loop_budget "$TOOL_COMMAND"; then
        exit "$HOOK_BLOCK_EXIT_CODE"
    fi
fi

# Run API routing check for applicable tools
if ! enforce_mandatory_routing "$TOOL_NAME"; then
    exit 0
fi

# Run API routing check for applicable tools
check_api_routing "$TOOL_NAME" "$INPUT_DATA"

# ============================================================================
# CONTRACT VALIDATION
# ============================================================================

# Check if we have a contract for this tool
if [ ! -f "$CONTRACTS_FILE" ]; then
    echo '{"continue": true, "note": "Contracts file not found"}' >&2
    exit 0
fi

# Check if contract exists for this tool
CONTRACT_EXISTS=$(jq -r ".contracts[\"$CONTRACT_NAME\"] // empty" "$CONTRACTS_FILE" 2>/dev/null)

if [ -z "$CONTRACT_EXISTS" ]; then
    # No contract for this tool - allow execution
    log_entry=$(jq -nc \
        --arg tool "$TOOL_NAME" \
        --arg contract "$CONTRACT_NAME" \
        --arg status "skipped" \
        --arg reason "no_contract" \
        --arg timestamp "$(date -Iseconds)" \
        '{timestamp: $timestamp, tool: $tool, contract: $contract, status: $status, reason: $reason}')
    safe_append_jsonl "$log_entry" "$LOG_FILE"
    exit 0
fi

# Extract tool input for validation
TOOL_INPUT=$(echo "$INPUT_DATA" | jq -c '.tool_input // {}' 2>/dev/null)

# Run validation via Node.js validator
if [ -f "$VALIDATOR_SCRIPT" ]; then
    # Create temp file for validation
    TEMP_INPUT=$(mktemp)
    echo "$TOOL_INPUT" > "$TEMP_INPUT"

    VALIDATION_RESULT=$(node -e "
        const fs = require('fs');

        let contracts = {};
        try {
            const raw = JSON.parse(fs.readFileSync('$CONTRACTS_FILE', 'utf8'));
            contracts = raw.contracts || {};
        } catch (err) {
            console.log(JSON.stringify({
                valid: true,
                errors: [],
                tool: '$TOOL_NAME',
                contract: '$CONTRACT_NAME',
                timestamp: new Date().toISOString()
            }));
            process.exit(0);
        }

        const contract = contracts['$CONTRACT_NAME'];
        const input = JSON.parse(fs.readFileSync('$TEMP_INPUT', 'utf8'));

        const errors = [];

        if (contract && contract.input) {
            const schema = contract.input || {};
            if (Array.isArray(schema.required)) {
                for (const field of schema.required) {
                    if (input[field] === undefined || input[field] === null) {
                        errors.push('Missing required field: ' + field);
                    }
                }
            }

            if (schema.properties && typeof schema.properties === 'object') {
                for (const [field, def] of Object.entries(schema.properties)) {
                    if (input[field] === undefined || input[field] === null || !def) continue;
                    const expected = def.type;
                    if (!expected) continue;
                    const value = input[field];
                    const actualType = Array.isArray(value) ? 'array' : typeof value;
                    if (expected === 'integer') {
                        if (typeof value !== 'number' || !Number.isInteger(value)) {
                            errors.push('Field ' + field + ' should be integer');
                        }
                    } else if (expected !== actualType) {
                        errors.push('Field ' + field + ' type mismatch: ' + actualType + ' vs ' + expected);
                    }
                }
            }
        }

        // Check validation rules beyond schema
        const ruleViolations = [];
        if (contract && contract.validationRules) {
            for (const rule of contract.validationRules) {
                // Check for specific SOQL rules
                if (rule.id === 'aggregate-group-by' && input.query) {
                    const query = String(input.query).toUpperCase();
                    if (query.match(/COUNT\s*\(|SUM\s*\(|AVG\s*\(|MIN\s*\(|MAX\s*\(/)) {
                        // Has aggregate - check for proper GROUP BY
                        if (!query.includes('GROUP BY') && query.includes(',')) {
                            ruleViolations.push('Aggregate query with multiple fields may need GROUP BY');
                        }
                    }
                }

                // Check for CSV index access pattern
                if (rule.id === 'header-based-access' && input.code) {
                    if (String(input.code).match(/row\[\d+\]|columns\[\d+\]/)) {
                        ruleViolations.push('CSV access using hardcoded indices - use header-based access');
                    }
                }
            }
        }

        const output = {
            valid: errors.length === 0 && ruleViolations.length === 0,
            errors: [...errors, ...ruleViolations],
            tool: '$TOOL_NAME',
            contract: '$CONTRACT_NAME',
            timestamp: new Date().toISOString()
        };

        console.log(JSON.stringify(output));
    " 2>/dev/null || true)

    rm -f "$TEMP_INPUT"

    if [ -z "$VALIDATION_RESULT" ]; then
        # Validation script failed - allow execution but log
        log_entry=$(jq -nc \
            --arg tool "$TOOL_NAME" \
            --arg contract "$CONTRACT_NAME" \
            --arg status "error" \
            --arg reason "validation_script_failed" \
            --arg timestamp "$(date -Iseconds)" \
            '{timestamp: $timestamp, tool: $tool, contract: $contract, status: $status, reason: $reason}')
        safe_append_jsonl "$log_entry" "$LOG_FILE"
        exit 0
    fi

    # Parse validation result
    IS_VALID=$(echo "$VALIDATION_RESULT" | jq -r '.valid')
    ERRORS=$(echo "$VALIDATION_RESULT" | jq -r '.errors | join("; ")')

    # Log the validation
    safe_append_jsonl "$VALIDATION_RESULT" "$LOG_FILE"

    if [ "$IS_VALID" = "true" ]; then
        # Validation passed
        exit 0
    else
        # Validation failed - output warning but don't block (configurable)
        BLOCK_ON_VIOLATION="${TOOL_CONTRACT_BLOCK_ON_VIOLATION:-false}"

        if [ "$BLOCK_ON_VIOLATION" = "true" ]; then
            # Block execution
            echo "[CONTRACT VIOLATION] Tool: $TOOL_NAME"
            echo "Errors: $ERRORS"
            echo ""
            echo "Set TOOL_CONTRACT_BLOCK_ON_VIOLATION=false to warn instead of block"
            exit "$HOOK_BLOCK_EXIT_CODE"
        else
            # Warn but allow
            echo "[CONTRACT WARNING] Tool: $TOOL_NAME" >&2
            echo "Potential issues: $ERRORS" >&2
            echo "" >&2
            exit 0
        fi
    fi
else
    # Validator script not found - log and allow
    log_entry=$(jq -nc \
        --arg tool "$TOOL_NAME" \
        --arg status "skipped" \
        --arg reason "validator_not_found" \
        --arg timestamp "$(date -Iseconds)" \
        '{timestamp: $timestamp, tool: $tool, status: $status, reason: $reason}')
    safe_append_jsonl "$log_entry" "$LOG_FILE"
    exit 0
fi
