#!/bin/bash
# PreToolUse hook for Bash(sf project deploy*)
# Steers Claude toward sfdc-deployment-manager when deploying outside agent context
#
# This blocks the TOOL CALL (not the user prompt) when sf project deploy
# is invoked directly instead of through a deployment agent.

APPROVED_AGENTS="sfdc-deployment-manager|release-coordinator|sfdc-orchestrator|sfdc-metadata-manager"
CALLING_AGENT="${CLAUDE_AGENT_NAME:-${AGENT_NAME:-${SUBAGENT_TYPE:-}}}"

# If inside an approved agent, allow
if [[ -n "$CALLING_AGENT" ]] && echo "$CALLING_AGENT" | grep -qE "$APPROVED_AGENTS"; then
    exit 0
fi

# Fallback: check if we're inside ANY Task tool invocation by looking for agent
# context signals in the environment (CLAUDE_AGENT_NAME may not always be set)
if [[ -n "${CLAUDE_TASK_ID:-}" ]] && [[ -n "${CALLING_AGENT}" ]]; then
    # Inside a Task but agent not in approved list — still block
    :
elif [[ -n "${CLAUDE_TASK_ID:-}" ]]; then
    # Inside a Task but agent name unavailable — warn but allow
    echo "WARNING: sf project deploy running inside Task but CLAUDE_AGENT_NAME not set. Allowing." >&2
    exit 0
fi

# Escape hatch for intentional direct deploys
if [[ "${ALLOW_DIRECT_DEPLOY:-0}" == "1" ]]; then
    exit 0
fi

# Not in agent context — output steering instruction and block the tool call
cat <<'EOF'
DEPLOY BLOCKED: sf project deploy must be run through a deployment agent.
Use: Task(subagent_type='opspal-salesforce:sfdc-deployment-manager', prompt='<your deploy request>')
The deployment manager provides validation, error recovery, and verification.
To bypass: export ALLOW_DIRECT_DEPLOY=1
EOF
exit 1
