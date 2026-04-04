#!/usr/bin/env bash
# =============================================================================
# SOP Subagent Completion (SubagentStop child)
# =============================================================================
# Purpose: Emit task_graph.created when task-graph-orchestrator stops,
#          and work.completed for other orchestrator-class agents.
# Feature flag: SOP_ENABLED (default: 0)
# Mutation boundary: This hook ONLY calls the SOP runtime. No direct mutations.
# =============================================================================

set -euo pipefail

# Feature flag
SOP_ENABLED="${SOP_ENABLED:-1}"
[ "$SOP_ENABLED" != "1" ] && exit 0

# Dispatcher guard
[ "${DISPATCHER_CONTEXT:-0}" != "1" ] && [ -t 0 ] && exit 0

# Read input
HOOK_INPUT=""
[ ! -t 0 ] && HOOK_INPUT=$(cat 2>/dev/null || true)
[ -z "$HOOK_INPUT" ] && exit 0

# jq required
command -v jq &>/dev/null || exit 0

# Resolve plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify SOP runtime
SOP_RUNTIME="$PLUGIN_ROOT/scripts/lib/sop/sop-runtime.js"
[ ! -f "$SOP_RUNTIME" ] && exit 0
command -v node &>/dev/null || exit 0

# Extract agent name from hook input
AGENT_NAME=$(printf '%s' "$HOOK_INPUT" | jq -r '.agent_name // .subagent_type // .agent_type // empty' 2>/dev/null || true)
[ -z "$AGENT_NAME" ] && exit 0

# Determine event type
EVENT_TYPE=""
CONFIDENCE="inferred_high"

case "$AGENT_NAME" in
  task-graph-orchestrator)
    EVENT_TYPE="task_graph.created"
    ;;
  sfdc-orchestrator|hubspot-orchestrator|marketo-orchestrator|sfdc-cpq-assessor|sfdc-revops-auditor|sfdc-automation-auditor|sfdc-architecture-auditor|hubspot-assessment-analyzer)
    EVENT_TYPE="work.completed"
    ;;
  *)
    # Check agent event mappings for completion agents
    SOP_AGENT_MAP="$PLUGIN_ROOT/config/sop/sop-agent-event-mappings.json"
    if [ -f "$SOP_AGENT_MAP" ]; then
      IS_COMPLETION=$(jq -r --arg agent "$AGENT_NAME" '.completion_agents | if . then index($agent) != null else false end' "$SOP_AGENT_MAP" 2>/dev/null || echo "false")
      if [ "$IS_COMPLETION" = "true" ]; then
        EVENT_TYPE="work.completed"
      fi
    fi
    ;;
esac

[ -z "$EVENT_TYPE" ] && exit 0

# Resolve org
ORG="${ORG_SLUG:-${CLIENT_ORG:-${SF_TARGET_ORG:-}}}"
[ -z "$ORG" ] && exit 0

CONTEXT=$(jq -nc \
  --arg org_slug "$ORG" \
  --arg agent "$AGENT_NAME" \
  '{org_slug: $org_slug, agent_name: $agent}')

RESULT=$(node "$SOP_RUNTIME" --event "$EVENT_TYPE" --confidence "$CONFIDENCE" --context "$CONTEXT" 2>/dev/null || echo '{}')

SYSTEM_MSG=$(printf '%s' "$RESULT" | jq -r '.system_message // empty' 2>/dev/null || true)
if [ -n "$SYSTEM_MSG" ]; then
  jq -nc --arg msg "$SYSTEM_MSG" '{
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "SubagentStop",
      additionalContext: $msg
    }
  }'
else
  exit 0
fi
