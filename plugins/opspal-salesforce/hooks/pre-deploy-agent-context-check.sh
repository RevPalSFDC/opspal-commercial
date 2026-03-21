#!/bin/bash
# PreToolUse hook for source-scoped Salesforce deploy commands
# Steers direct deploy mutations toward sfdc-deployment-manager unless the
# target org is explicitly sandbox-like, which avoids the deployment-agent
# Bash deadlock when Claude runtime withholds Bash from sub-agents.
#
# This blocks the TOOL CALL (not the user prompt) when sf project deploy
# is invoked directly instead of through a deployment agent.

set -euo pipefail

APPROVED_AGENTS="sfdc-deployment-manager|release-coordinator|sfdc-orchestrator|sfdc-metadata-manager"
CALLING_AGENT="${CLAUDE_AGENT_NAME:-${AGENT_NAME:-${SUBAGENT_TYPE:-}}}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
TARGET_ORG="${SF_TARGET_ORG:-}"

is_deploy_scope_command() {
    printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])sf[[:space:]]+project[[:space:]]+deploy[[:space:]]+(start|validate|preview)([[:space:]]|$)'
}

extract_target_org() {
    local extracted=""

    extracted="$(printf '%s' "$COMMAND" | sed -nE 's/.*(--target-org|-o)[[:space:]]+([^[:space:]]+).*/\2/p' | head -n 1)"
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

    printf '%s' "$org_alias" \
        | tr '[:upper:]' '[:lower:]' \
        | grep -qE '(^|[-_])(sandbox|sbx|dev|test|qa|uat|staging|stg|sit|scratch|so|scratchorg)([-_]|[0-9]|$)'
}

# Only guard source-scoped deploy commands. Lifecycle/status commands such as
# deploy report are handled separately and must not be routed through this hook.
# This hook now runs behind a plain Bash
# matcher because Claude matchers filter on tool_name, not command arguments.
if [[ -z "$COMMAND" ]] || ! is_deploy_scope_command; then
    exit 0
fi

# If inside an approved agent, allow
if [[ -n "$CALLING_AGENT" ]] && echo "$CALLING_AGENT" | grep -qE "$APPROVED_AGENTS"; then
    exit 0
fi

# Fallback: check if we're inside ANY Agent invocation by looking for agent
# context signals in the environment (CLAUDE_AGENT_NAME may not always be set)
if [[ -n "${CLAUDE_TASK_ID:-}" ]] && [[ -n "${CALLING_AGENT}" ]]; then
    # Inside an Agent but agent not in approved list — still block
    :
elif [[ -n "${CLAUDE_TASK_ID:-}" ]]; then
    # Inside an Agent but agent name unavailable — warn but allow
    echo "WARNING: sf project deploy running inside Agent but CLAUDE_AGENT_NAME not set. Allowing." >&2
    exit 0
fi

# Escape hatch for intentional direct deploys
if [[ "${ALLOW_DIRECT_DEPLOY:-0}" == "1" ]]; then
    exit 0
fi

TARGET_ORG="$(extract_target_org)"
if [[ -n "$TARGET_ORG" ]] && is_sandbox_like_target "$TARGET_ORG"; then
    echo "WARNING: Allowing direct sf project deploy for sandbox-like target org '$TARGET_ORG' to avoid deployment-agent Bash deadlock." >&2
    exit 0
fi

# Not in agent context — output steering instruction and block the tool call
cat <<'EOF' >&2
DEPLOY BLOCKED: sf project deploy must be run through a deployment agent.
Use: Agent(subagent_type='opspal-salesforce:sfdc-deployment-manager', prompt='<your deploy request>')
The deployment manager provides validation, error recovery, and verification.
To bypass: export ALLOW_DIRECT_DEPLOY=1
EOF
exit 2
