#!/usr/bin/env bash

###############################################################################
# Post-Agent-Operation Hook
#
# Automatically logs all agent operations to audit trail after execution.
# Part of the Agent Governance Framework.
#
# Triggers: After any agent operation completes
# Actions:
#   1. Log operation to audit trail
#   2. Update approval request status (if applicable)
#   3. Update change ticket (if Phase 2 implemented)
#   4. Record outcome for historical risk calculation
#
# Version: 1.0.0
# Created: 2025-10-25
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUDIT_LOGGER="$PLUGIN_ROOT/scripts/lib/agent-action-audit-logger.js"
CHANGE_TICKET_MANAGER="$PLUGIN_ROOT/scripts/lib/change-ticket-manager.js"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# PostToolUse hooks must not emit human-readable stdout.
exec 1>&2

###############################################################################
# Parse operation context
###############################################################################

AGENT_NAME="${AGENT_NAME:-unknown}"
OPERATION_TYPE="${OPERATION_TYPE:-UNKNOWN}"
ENVIRONMENT="${TARGET_ORG:-${SF_TARGET_ORG:-unknown}}"
OPERATION_SUCCESS="${OPERATION_SUCCESS:-true}"
OPERATION_DURATION="${OPERATION_DURATION:-0}"

# Check if audit logging is enabled
if [[ "${AUDIT_LOGGING_ENABLED:-true}" != "true" ]]; then
    # Audit logging disabled - skip
    exit 0
fi

###############################################################################
# Construct audit log entry
###############################################################################

TIMESTAMP=$(date -Iseconds)

# Create temp file for log entry
LOG_ENTRY=$(mktemp "${TMPDIR:-/tmp}/audit-log-XXXXXX.json")

cat > "$LOG_ENTRY" << EOF
{
  "agent": "$AGENT_NAME",
  "operation": "$OPERATION_TYPE",
  "risk": {
    "riskScore": ${RISK_SCORE:-0},
    "riskLevel": "${RISK_LEVEL:-UNKNOWN}"
  },
  "approval": {
    "status": "${APPROVAL_STATUS:-NOT_REQUIRED}"
  },
  "environment": {
    "org": "$ENVIRONMENT",
    "user": "${USER:-unknown}"
  },
  "operationDetails": {},
  "execution": {
    "startTime": "$TIMESTAMP",
    "endTime": "$TIMESTAMP",
    "durationMs": $OPERATION_DURATION,
    "success": $OPERATION_SUCCESS,
    "errors": []
  },
  "verification": {
    "performed": false
  },
  "reasoning": {
    "intent": "${OPERATION_REASONING:-Automated operation}"
  },
  "rollback": {
    "planExists": false
  }
}
EOF

###############################################################################
# Log to audit trail
###############################################################################

if [[ -f "$AUDIT_LOGGER" ]]; then
    echo -e "${BLUE}📝 Logging to audit trail...${NC}"

    if node "$AUDIT_LOGGER" log "$LOG_ENTRY" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Audit log created${NC}"
    else
        echo "⚠️  Audit logging failed (non-fatal)"
    fi
else
    echo "⚠️  Audit logger not found, skipping audit log"
fi

# Cleanup
rm -f "$LOG_ENTRY"

###############################################################################
# Update approval request status (if applicable)
###############################################################################

if [[ -n "${APPROVAL_REQUEST_ID:-}" ]]; then
    echo "Updating approval request: $APPROVAL_REQUEST_ID"

    # Update status to COMPLETED
    APPROVAL_FILE="$HOME/.claude/approvals/pending/$APPROVAL_REQUEST_ID.json"

    if [[ -f "$APPROVAL_FILE" ]]; then
        # Move to approved directory
        APPROVED_DIR="$HOME/.claude/approvals/approved"
        mkdir -p "$APPROVED_DIR"
        mv "$APPROVAL_FILE" "$APPROVED_DIR/"
        echo "✅ Approval request marked complete"
    fi
fi

###############################################################################
# Update change ticket (Phase 2 - placeholder)
###############################################################################

if [[ -n "${CHANGE_TICKET_ID:-}" ]]; then
    echo "Change ticket: $CHANGE_TICKET_ID"
    if [[ -f "$CHANGE_TICKET_MANAGER" ]]; then
        if node "$CHANGE_TICKET_MANAGER" post-operation >/dev/null 2>&1; then
            echo "✅ Change ticket updated"
        else
            echo "⚠️  Change ticket update failed (non-fatal)"
        fi
    else
        echo "⚠️  Change ticket manager not found (non-fatal)"
    fi
fi

exit 0
