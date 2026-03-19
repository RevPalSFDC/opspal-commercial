#!/bin/bash

###############################################################################
# Universal Agent Governance Hook — HubSpot
#
# Ported from opspal-salesforce/hooks/universal-agent-governance.sh
# Enforces governance for HubSpot bulk operations, contact merges,
# workflow modifications, and portal-wide changes.
#
# Triggers: Before any HubSpot agent task execution
# Actions:
#   1. Detect operation type from agent name and context
#   2. Calculate risk based on operation scope
#   3. Block CRITICAL operations (bulk delete, mass merge)
#   4. Warn on HIGH risk operations (bulk update, workflow changes)
#   5. Log operation to audit trail
#
# Exit Codes:
#   0 - Allowed (operation can proceed)
#   1 - Blocked (CRITICAL risk - operation denied)
#   2 - Approval required (HIGH risk)
#
# Version: 1.0.0
# Created: 2026-03-16
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source error handler if available (check plugin-local, then sibling core plugin)
ERROR_HANDLER="${PLUGIN_ROOT}/hooks/lib/error-handler.sh"
if [[ ! -f "$ERROR_HANDLER" ]]; then
  # Fall back to core plugin error handler via CLAUDE_PLUGIN_ROOT parent
  for candidate in "${CLAUDE_PLUGIN_ROOT:-}/../opspal-core/hooks/lib/error-handler.sh" \
                    "${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"; do
    if [[ -f "$candidate" ]]; then
      ERROR_HANDLER="$candidate"
      break
    fi
  done
fi
if [[ -f "$ERROR_HANDLER" ]]; then
  source "$ERROR_HANDLER"
  HOOK_NAME="hubspot-universal-agent-governance"
  set_lenient_mode 2>/dev/null || true
fi

# Colors (use := to avoid overriding if error-handler already set them)
: "${RED:='\033[0;31m'}"
: "${YELLOW:='\033[1;33m'}"
: "${GREEN:='\033[0;32m'}"
: "${BLUE:='\033[0;34m'}"
: "${NC:='\033[0m'}"

# Configuration
GOVERNANCE_ENABLED="${HS_AGENT_GOVERNANCE_ENABLED:-true}"

if [[ "$GOVERNANCE_ENABLED" != "true" ]]; then
  exit 0
fi

# Parse agent name from environment
AGENT_NAME="${CLAUDE_AGENT_NAME:-${CLAUDE_TASK_AGENT:-unknown}}"
AGENT_NAME=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')

# Skip self-governance agents
case "$AGENT_NAME" in
  *governance*|*validator*|*auditor*|unknown)
    exit 0
    ;;
esac

###############################################################################
# Classify operation risk
###############################################################################

RISK_LEVEL="LOW"
RISK_REASON=""
REQUIRES_APPROVAL="false"
BLOCKED="false"

# Read hook input for additional context
HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat 2>/dev/null || true)
fi

PROMPT=""
if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
  PROMPT=$(echo "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // ""' 2>/dev/null || echo "")
fi

PROMPT_LOWER=$(echo "${PROMPT}" | tr '[:upper:]' '[:lower:]')

# CRITICAL operations — block without approval
if echo "$PROMPT_LOWER" | grep -qE "(delete all|purge|mass delete|bulk delete|drop all|clear all)"; then
  RISK_LEVEL="CRITICAL"
  RISK_REASON="Mass deletion detected"
  BLOCKED="true"
fi

# HIGH risk operations — require approval
if [[ "$BLOCKED" != "true" ]]; then
  case "$AGENT_NAME" in
    *data-operations*|*bulk*|*batch*)
      if echo "$PROMPT_LOWER" | grep -qE "(update|upsert|import|merge|delete)" && \
         echo "$PROMPT_LOWER" | grep -qE "([0-9]{4,}|all contacts|all companies|entire|bulk|mass)"; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Bulk data modification (>1000 records estimated)"
        REQUIRES_APPROVAL="true"
      fi
      ;;
    *merge*|*dedup*)
      RISK_LEVEL="HIGH"
      RISK_REASON="Merge/dedup operation — irreversible"
      REQUIRES_APPROVAL="true"
      ;;
    *workflow-builder*|*marketing-automation*)
      if echo "$PROMPT_LOWER" | grep -qE "(production|activate|enable|deploy|live)"; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Production workflow modification"
        REQUIRES_APPROVAL="true"
      fi
      ;;
    *property-manager*)
      if echo "$PROMPT_LOWER" | grep -qE "(delete|remove|rename|change type)"; then
        RISK_LEVEL="MEDIUM"
        RISK_REASON="Property schema modification"
      fi
      ;;
  esac
fi

# MEDIUM risk — enhanced logging
if [[ "$RISK_LEVEL" == "LOW" ]]; then
  case "$AGENT_NAME" in
    *contact-manager*|*data-hygiene*|*email-campaign*|*sdr-operations*)
      if echo "$PROMPT_LOWER" | grep -qE "(update|change|modify|set|assign)"; then
        RISK_LEVEL="MEDIUM"
        RISK_REASON="Data modification operation"
      fi
      ;;
  esac
fi

###############################################################################
# Enforce governance
###############################################################################

# Log governance decision
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_DIR="${CLAUDE_PROJECT_ROOT:-$(pwd)}/.claude/logs/hooks"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="$LOG_DIR/hubspot-agent-governance-$(date +%Y-%m-%d).jsonl"

if command -v jq &>/dev/null; then
  jq -nc \
    --arg ts "$TIMESTAMP" \
    --arg agent "$AGENT_NAME" \
    --arg risk "$RISK_LEVEL" \
    --arg reason "$RISK_REASON" \
    --arg blocked "$BLOCKED" \
    --arg approval "$REQUIRES_APPROVAL" \
    '{timestamp: $ts, agent: $agent, risk_level: $risk, reason: $reason, blocked: ($blocked == "true"), requires_approval: ($approval == "true")}' \
    >> "$LOG_FILE" 2>/dev/null || true
fi

# CRITICAL — block
if [[ "$BLOCKED" == "true" ]]; then
  echo -e "${RED}BLOCKED: HubSpot Agent Governance${NC}" >&2
  echo "  Agent: $AGENT_NAME" >&2
  echo "  Risk: $RISK_LEVEL — $RISK_REASON" >&2
  echo "  Action: Operation denied. Use [GOVERNANCE_OVERRIDE] with justification." >&2
  echo "" >&2
  [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
  exit 1
fi

# HIGH — approval warning
if [[ "$REQUIRES_APPROVAL" == "true" ]]; then
  echo -e "${YELLOW}HubSpot Agent Governance: Approval Required${NC}" >&2
  echo "  Agent: $AGENT_NAME" >&2
  echo "  Risk: $RISK_LEVEL — $RISK_REASON" >&2
  echo "  Action: Proceeding with enhanced logging. Confirm before irreversible operations." >&2
  echo "" >&2
fi

# MEDIUM — info
if [[ "$RISK_LEVEL" == "MEDIUM" ]]; then
  echo -e "${BLUE}HubSpot Governance: $RISK_REASON${NC}" >&2
fi

# Pass through
[ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
exit 0
