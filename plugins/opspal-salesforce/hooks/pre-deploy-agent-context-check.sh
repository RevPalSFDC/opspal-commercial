#!/usr/bin/env bash
# PreToolUse hook for source-scoped Salesforce deploy commands
# Steers direct deploy mutations toward sfdc-deployment-manager unless the
# target org is explicitly sandbox-like, which avoids the deployment-agent
# Bash deadlock when Claude runtime withholds Bash from sub-agents.
#
# This blocks the TOOL CALL (not the user prompt) when sf project deploy
# is invoked directly instead of through a deployment agent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v jq &>/dev/null; then
    echo "[pre-deploy-agent-context-check] jq not found, skipping" >&2
    exit 0
fi

# Standalone guard — this hook is invoked by pre-bash-dispatcher.sh via
# run_child_hook() which sets DISPATCHER_CONTEXT=1 and pipes HOOK_INPUT.
# When run standalone (no dispatcher context and stdin is a terminal),
# exit 0 cleanly rather than failing on missing context.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PLUGINS_ROOT="$(cd "$PLUGIN_ROOT/.." && pwd)"
ROUTING_STATE_MANAGER="${PLUGINS_ROOT}/opspal-core/scripts/lib/routing-state-manager.js"
CORE_PLUGIN_ROOT="${PLUGINS_ROOT}/opspal-core"
CLASSIFIER_LIB="${CORE_PLUGIN_ROOT}/scripts/lib/classify-bash-command.sh"
ENVIRONMENT_LIB="${CORE_PLUGIN_ROOT}/scripts/lib/detect-environment.sh"
AGENT_TOOL_REGISTRY="${CORE_PLUGIN_ROOT}/scripts/lib/agent-tool-registry.js"
ROUTING_CAPABILITY_RULES="${CORE_PLUGIN_ROOT}/config/routing-capability-rules.json"

if [[ -f "$CLASSIFIER_LIB" ]]; then
    # shellcheck source=/dev/null
    source "$CLASSIFIER_LIB"
fi

if [[ -f "$ENVIRONMENT_LIB" ]]; then
    # shellcheck source=/dev/null
    source "$ENVIRONMENT_LIB"
fi

LEGACY_APPROVED_AGENTS="sfdc-deployment-manager|release-coordinator|sfdc-orchestrator|sfdc-metadata-manager"
HOOK_INPUT="$(cat 2>/dev/null || true)"
# Extract agent identity from hook JSON — Claude Code provides agent_type
# in the hook input when running inside a sub-agent context.
HOOK_AGENT_TYPE="$(printf '%s' "$HOOK_INPUT" | jq -r '.agent_type // empty' 2>/dev/null || echo "")"
# Prefer hook-provided agent_type, fall back to env vars for backward compat
CALLING_AGENT="${HOOK_AGENT_TYPE:-${CLAUDE_AGENT_NAME:-${AGENT_NAME:-${SUBAGENT_TYPE:-}}}}"
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
TARGET_ORG="${SF_TARGET_ORG:-}"

extract_session_key() {
    local session_key=""

    session_key=$(printf '%s' "$HOOK_INPUT" | jq -r '
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

    printf '%s' ""
}

is_deploy_scope_command() {
    printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(sf|sfdx)[[:space:]]+project[[:space:]]+deploy[[:space:]]+(start|validate|preview)([[:space:]]|$)'
}

extract_target_org() {
    local extracted=""

    if declare -F extract_salesforce_target_alias >/dev/null 2>&1; then
        extracted="$(extract_salesforce_target_alias "$COMMAND")"
    fi

    if [[ -z "$extracted" ]]; then
        extracted="$(printf '%s' "$COMMAND" | sed -nE 's/.*(--target-org|-o)[[:space:]]+([^[:space:]]+).*/\2/p' | head -n 1)"
    fi

    if [[ -z "$extracted" ]]; then
        extracted="$(printf '%s' "$COMMAND" | sed -nE 's/.*(--target-org|-o)=([^[:space:]]+).*/\2/p' | head -n 1)"
    fi

    if [[ -n "$extracted" ]]; then
        printf '%s\n' "$extracted"
    elif [[ -n "$TARGET_ORG" ]]; then
        printf '%s\n' "$TARGET_ORG"
    fi
}

is_sandbox_like_target() {
    local org_alias="$1"

    if declare -F is_salesforce_sandbox_like >/dev/null 2>&1; then
        is_salesforce_sandbox_like "$org_alias"
        return $?
    fi

    printf '%s' "$org_alias" \
        | tr '[:upper:]' '[:lower:]' \
        | grep -qE '(^|[-_])(sandbox|sbx|dev|test|qa|uat|staging|stg|sit|scratch|so|scratchorg)([-_]|[0-9]|$)'
}

read_deploy_policy_requirements() {
    local policy_name="$1"

    if [[ ! -f "$ROUTING_CAPABILITY_RULES" ]]; then
        printf '%s' '{}'
        return 0
    fi

    jq -c --arg policy_name "$policy_name" '
      .salesforce.deployPolicies[$policy_name] // {}
    ' "$ROUTING_CAPABILITY_RULES" 2>/dev/null || printf '%s' '{}'
    return 0
}

agent_matches_requirements() {
    local agent_name="$1"
    local requirements_json="$2"

    if [[ -z "$agent_name" ]] || [[ -z "$requirements_json" ]] || [[ "$requirements_json" == "{}" ]]; then
        return 1
    fi

    if [[ -f "$AGENT_TOOL_REGISTRY" ]] && command -v node &>/dev/null; then
        node "$AGENT_TOOL_REGISTRY" matches-requirements "$agent_name" "$requirements_json" "$CORE_PLUGIN_ROOT" >/dev/null 2>&1
        return $?
    fi

    if [[ "$agent_name" =~ $LEGACY_APPROVED_AGENTS ]]; then
        return 0
    fi

    return 1
}

resolve_deploy_execute_policy_name() {
    local org_alias="$1"

    if [[ -n "$org_alias" ]] && is_sandbox_like_target "$org_alias"; then
        printf '%s' 'sandbox_execute'
        return 0
    fi

    printf '%s' 'production_execute'
}

agent_matches_deploy_policy() {
    local agent_name="$1"
    local policy_name="$2"
    local requirements_json=""

    requirements_json="$(read_deploy_policy_requirements "$policy_name")"
    agent_matches_requirements "$agent_name" "$requirements_json"
}

agent_has_parent_clearance_capability() {
    local agent_name="$1"
    local requirements_json=""

    requirements_json="$(read_deploy_policy_requirements "parent_clearance")"
    agent_matches_requirements "$agent_name" "$requirements_json"
}

has_parent_context_deploy_clearance() {
    local session_key="$1"
    local state=""
    local status=""
    local resolved_agent=""

    if [[ -z "$session_key" ]] || [[ ! -f "$ROUTING_STATE_MANAGER" ]] || ! command -v node &>/dev/null; then
        return 1
    fi

    state=$(node "$ROUTING_STATE_MANAGER" get "$session_key" 2>/dev/null || echo '{"state":null}')
    status=$(printf '%s' "$state" | jq -r '.status // .state.status // ""' 2>/dev/null || echo "")
    resolved_agent=$(printf '%s' "$state" | jq -r '.last_resolved_agent // .state.last_resolved_agent // .recommended_agent // .state.recommended_agent // ""' 2>/dev/null || echo "")

    if [[ "$status" =~ ^(cleared|bypassed)$ ]] && agent_has_parent_clearance_capability "$resolved_agent"; then
        return 0
    fi

    return 1
}

# Only guard source-scoped deploy commands. Lifecycle/status commands such as
# deploy report are handled separately and must not be routed through this hook.
# This hook now runs behind a plain Bash
# matcher because Claude matchers filter on tool_name, not command arguments.
if [[ -z "$COMMAND" ]] || ! is_deploy_scope_command; then
    exit 0
fi

TARGET_ORG="$(extract_target_org)"
DEPLOY_POLICY_NAME="$(resolve_deploy_execute_policy_name "$TARGET_ORG")"

# If inside an approved agent, allow
if [[ -n "$CALLING_AGENT" ]] && agent_matches_deploy_policy "$CALLING_AGENT" "$DEPLOY_POLICY_NAME"; then
    exit 0
fi

# Allow any Agent context — the routing system already ensures the right agent
# is used. Sub-agents inherit parent permissions per Claude Code docs, so
# approved agents CAN execute sf project deploy from sub-agent context.
if [[ -n "${HOOK_AGENT_TYPE}" ]] || [[ -n "${CLAUDE_TASK_ID:-}" ]]; then
    echo "INFO: sf project deploy running inside Agent context (agent=${CALLING_AGENT:-unknown}). Allowing." >&2
    exit 0
fi

# Escape hatch for intentional direct deploys
if [[ "${ALLOW_DIRECT_DEPLOY:-0}" == "1" ]]; then
    exit 0
fi

if [[ -n "$TARGET_ORG" ]] && is_sandbox_like_target "$TARGET_ORG"; then
    echo "WARNING: Allowing direct sf project deploy for sandbox-like target org '$TARGET_ORG' to avoid deployment-agent Bash deadlock." >&2
    exit 0
fi

SESSION_KEY="$(extract_session_key)"
if [[ -n "$SESSION_KEY" ]] && has_parent_context_deploy_clearance "$SESSION_KEY"; then
    echo "INFO: Allowing direct sf project deploy after approved deployment planning in this session." >&2
    exit 0
fi

# Not in agent context — output steering instruction and block the tool call.
# Write human-readable message to stderr (visible in Claude Code output).
# Emit JSON blockExecution to stdout so the dispatcher merges it and exits 0.
# (exit 2 would be treated as hook FAILURE by Claude Code, not intentional blocking.)
cat <<'EOF' >&2
DEPLOY BLOCKED: sf project deploy needs approved deployment planning before parent-context execution.
Use: Agent(subagent_type='opspal-salesforce:sfdc-deployment-manager', prompt='Prepare a parent-context deployment handoff for <your deploy request>. Do not execute sf project deploy from the subagent.')
For production or non-sandbox deploys, you can also use: Agent(subagent_type='opspal-core:release-coordinator', prompt='<your release request>')
After planning clears the session, rerun the deploy command from the parent/main context.
To bypass: export ALLOW_DIRECT_DEPLOY=1
EOF
jq -nc '{"blockExecution": true, "blockMessage": "DEPLOY BLOCKED: sf project deploy needs approved deployment planning. Use Agent(subagent_type=\"opspal-salesforce:sfdc-deployment-manager\") to prepare a deployment handoff first. To bypass: export ALLOW_DIRECT_DEPLOY=1"}' && exit 0
