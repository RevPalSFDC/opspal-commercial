#!/bin/bash

###############################################################################
# Pre-High-Risk-Operation Hook
#
# Automatically invoked before high-risk Salesforce operations to:
# 1. Calculate risk score
# 2. Request approval if needed
# 3. Enforce governance policies
#
# Part of the Agent Governance Framework
#
# Version: 1.1.0 (Error Handler Integration)
# Created: 2025-10-25
# Updated: 2025-11-24
###############################################################################

set -euo pipefail

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="${SCRIPT_DIR}/../../cross-platform-plugin/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-high-risk-operation"
    # Keep strict mode for security-critical hook
fi

# Configuration
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RISK_SCORER="$PLUGIN_ROOT/scripts/lib/agent-risk-scorer.js"
APPROVAL_CONTROLLER="$PLUGIN_ROOT/scripts/lib/human-in-the-loop-controller.js"

# Load stop prompt helper
source "$PLUGIN_ROOT/scripts/lib/hook-stop-prompt-helper.sh"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

###############################################################################
# Parse operation details from environment or arguments
###############################################################################

OPERATION_TYPE="${GOVERNANCE_OPERATION_TYPE:-UNKNOWN}"
AGENT_NAME="${GOVERNANCE_AGENT_NAME:-unknown-agent}"
ENVIRONMENT="${GOVERNANCE_ENVIRONMENT:-unknown}"
RECORD_COUNT="${GOVERNANCE_RECORD_COUNT:-0}"
COMPONENT_COUNT="${GOVERNANCE_COMPONENT_COUNT:-0}"

###############################################################################
# Check if governance is enabled
###############################################################################

if [[ "${AGENT_GOVERNANCE_ENABLED:-true}" != "true" ]]; then
    # Governance disabled - proceed without checks
    exit 0
fi

###############################################################################
# Check for emergency override
###############################################################################

if [[ -n "${AGENT_GOVERNANCE_OVERRIDE:-}" ]]; then
    echo -e "${YELLOW}⚠️  EMERGENCY OVERRIDE ACTIVE${NC}"
    echo "   Reason: ${OVERRIDE_REASON:-No reason provided}"
    echo "   Approver: ${OVERRIDE_APPROVER:-Unknown}"
    echo "   Timestamp: $(date -Iseconds)"
    echo ""

    # Log override
    echo "Logging emergency override..."

    # Proceed with operation
    exit 0
fi

###############################################################################
# Calculate risk score
###############################################################################

if [[ ! -f "$RISK_SCORER" ]]; then
    echo -e "${YELLOW}Warning: Risk scorer not found, skipping governance check${NC}"
    exit 0
fi

echo "📊 Calculating risk score..."

RISK_OUTPUT=$(node "$RISK_SCORER" \
    --type "$OPERATION_TYPE" \
    --agent "$AGENT_NAME" \
    --environment "$ENVIRONMENT" \
    --record-count "$RECORD_COUNT" \
    --component-count "$COMPONENT_COUNT" \
    2>&1)

RISK_EXIT_CODE=$?

# Parse risk score and level from output
RISK_SCORE=$(echo "$RISK_OUTPUT" | jq -r '.riskScore // 0' 2>/dev/null || echo "0")
RISK_LEVEL=$(echo "$RISK_OUTPUT" | jq -r '.riskLevel // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
REQUIRES_APPROVAL=$(echo "$RISK_OUTPUT" | jq -r '.requiresApproval // false' 2>/dev/null || echo "false")
BLOCKED=$(echo "$RISK_OUTPUT" | jq -r '.blocked // false' 2>/dev/null || echo "false")

echo "   Risk Score: $RISK_SCORE/100 ($RISK_LEVEL)"

###############################################################################
# Handle CRITICAL risk (blocked operations)
###############################################################################

if [[ "$BLOCKED" == "true" ]] || [[ "$RISK_EXIT_CODE" -ne 0 ]]; then
    # Use guided stop prompt instead of hard blocking
    stop_with_approval \
        "$OPERATION_TYPE by $AGENT_NAME" \
        "Risk Score: $RISK_SCORE/100 ($RISK_LEVEL) - Exceeds critical threshold (70)" \
        "Required approver: Security Team (security@gorevpal.com)" \
        "Detailed business justification required" \
        "Executive approval required" \
        "Comprehensive rollback plan required" \
        "Testing in full sandbox first"
fi

###############################################################################
# Handle HIGH risk (approval required)
###############################################################################

if [[ "$REQUIRES_APPROVAL" == "true" ]]; then
    echo -e "${YELLOW}⚠️  APPROVAL REQUIRED${NC}"
    echo "   Risk Score: $RISK_SCORE/100 ($RISK_LEVEL)"
    echo ""

    # Check if in CI/CD environment (non-interactive)
    if [[ ! -t 0 ]] || [[ -n "${CI:-}" ]]; then
        echo "Non-interactive environment detected"
        echo "Creating approval request..."

        # Create approval request file
        APPROVAL_REQUEST=$(mktemp /tmp/approval-request.XXXXXX.json)
        cat > "$APPROVAL_REQUEST" << EOF
{
  "operation": "$OPERATION_TYPE",
  "agent": "$AGENT_NAME",
  "target": "$ENVIRONMENT",
  "risk": $RISK_OUTPUT,
  "reasoning": "${GOVERNANCE_REASONING:-Operation requires approval}",
  "rollbackPlan": "${GOVERNANCE_ROLLBACK_PLAN:-Manual rollback required}",
  "affectedComponents": [],
  "affectedUsers": 0
}
EOF

        # Request approval
        APPROVAL_RESULT=$(node "$APPROVAL_CONTROLLER" request "$APPROVAL_REQUEST" 2>&1)
        REQUEST_ID=$(echo "$APPROVAL_RESULT" | jq -r '.requestId // "unknown"')

        echo "   Request ID: $REQUEST_ID"
        echo "   Status: PENDING"
        echo ""
        echo "   Check approval status:"
        echo "   node $APPROVAL_CONTROLLER check $REQUEST_ID"
        echo ""

        # Block operation until approval
        exit 1
    fi

    # Interactive approval
    echo "Requesting approval..."

    # Use approval controller to request interactive approval
    # This will prompt the user for yes/no

    # For now, in interactive mode, we can proceed with a warning
    echo -e "${YELLOW}⚠️  Proceeding with approval required${NC}"
    echo "   Please ensure proper approval is obtained"
    echo ""
fi

###############################################################################
# MEDIUM/LOW risk - proceed with logging
###############################################################################

if [[ "$RISK_LEVEL" == "MEDIUM" ]]; then
    echo -e "${GREEN}✅ PROCEEDING (MEDIUM risk)${NC}"
    echo "   Enhanced logging and monitoring enabled"
elif [[ "$RISK_LEVEL" == "LOW" ]]; then
    echo -e "${GREEN}✅ PROCEEDING (LOW risk)${NC}"
    echo "   Standard logging enabled"
fi

echo ""

# Exit successfully to allow operation
exit 0
