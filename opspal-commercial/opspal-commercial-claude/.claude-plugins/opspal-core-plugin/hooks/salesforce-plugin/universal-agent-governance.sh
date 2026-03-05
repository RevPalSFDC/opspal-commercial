#!/bin/bash

###############################################################################
# Universal Agent Governance Hook
#
# Automatically enforces Agent Governance Framework for ALL agents.
# Intercepts operations, calculates risk, enforces approvals, logs to audit trail.
#
# This hook makes governance automatic - no agent code changes needed.
#
# Triggers: Before any agent task execution
# Actions:
#   1. Detect agent tier from permission matrix
#   2. Calculate risk score for operation
#   3. Block if CRITICAL (>70)
#   4. Request approval if HIGH (51-70) and tier requires it
#   5. Log operation initiation to audit trail
#
# Version: 1.1.0 (Error Handler Integration)
# Created: 2025-10-25
# Updated: 2025-11-24
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="universal-agent-governance"
    # Keep strict mode - governance enforcement needs proper error tracking
fi
PERMISSION_MATRIX="$PLUGIN_ROOT/config/agent-permission-matrix.json"
RISK_SCORER="$PLUGIN_ROOT/scripts/lib/agent-risk-scorer.js"
GOVERNANCE_WRAPPER="$PLUGIN_ROOT/scripts/lib/agent-governance.js"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="${SCRIPT_DIR}/../../cross-platform-plugin/scripts/lib/output-formatter.js"
HOOK_LOGGER="${SCRIPT_DIR}/../../cross-platform-plugin/scripts/lib/hook-logger.js"
HOOK_NAME="universal-agent-governance"

# Colors (use error-handler defaults when available)
: "${RED:='\033[0;31m'}"
: "${YELLOW:='\033[1;33m'}"
: "${GREEN:='\033[0;32m'}"
: "${BLUE:='\033[0;34m'}"
: "${NC:='\033[0m'}" # No Color

###############################################################################
# Parse context from environment or Claude Code task metadata
###############################################################################

# Detect agent name from context
AGENT_NAME="${AGENT_NAME:-unknown}"

# Try to detect from task metadata
if [ -z "$AGENT_NAME" ] || [ "$AGENT_NAME" = "unknown" ]; then
    # Look for agent invocation in recent context
    AGENT_NAME=$(echo "${CLAUDE_TASK_AGENT:-unknown}" | tr '[:upper:]' '[:lower:]')
fi

# Operation details
OPERATION_TYPE="${OPERATION_TYPE:-UNKNOWN}"
ENVIRONMENT="${SALESFORCE_ENVIRONMENT:-${TARGET_ORG:-${SF_TARGET_ORG:-unknown}}}"
RECORD_COUNT="${RECORD_COUNT:-0}"
COMPONENT_COUNT="${COMPONENT_COUNT:-0}"

# Check if governance is enabled
if [[ "${AGENT_GOVERNANCE_ENABLED:-true}" != "true" ]]; then
    # Governance disabled globally - skip
    exit 0
fi

# Check if this is a governance agent (avoid recursion)
if [[ "$AGENT_NAME" == "sfdc-agent-governance" ]]; then
    # Governance agent monitoring itself - allow
    exit 0
fi

###############################################################################
# Load agent configuration from permission matrix
###############################################################################

if [[ ! -f "$PERMISSION_MATRIX" ]]; then
    echo -e "${YELLOW}⚠️  Permission matrix not found, skipping governance${NC}"
    exit 0
fi

# Extract agent tier
AGENT_TIER=$(jq -r ".agents[\"$AGENT_NAME\"].tier // 0" "$PERMISSION_MATRIX" 2>/dev/null || echo "0")

if [[ "$AGENT_TIER" == "null" ]] || [[ "$AGENT_TIER" == "0" ]]; then
    # Agent not in matrix - allow (may be new/unregistered)
    if [[ "$AGENT_NAME" != "unknown" ]]; then
        echo -e "${YELLOW}⚠️  Agent not in permission matrix: $AGENT_NAME${NC}"
        echo "   Add to config/agent-permission-matrix.json"
    fi
    exit 0
fi

echo -e "${BLUE}🛡️  Agent Governance Active${NC}"
echo "   Agent: $AGENT_NAME (Tier $AGENT_TIER)"
echo "   Environment: $ENVIRONMENT"

###############################################################################
# Tier-based governance enforcement
###############################################################################

# Tier 1: Read-only - no governance needed
if [[ "$AGENT_TIER" == "1" ]]; then
    echo "   Decision: ✅ Tier 1 (read-only) - proceed"
    exit 0
fi

# Tier 2: Standard operations - conditional governance
if [[ "$AGENT_TIER" == "2" ]]; then
    # Check if in production and high volume
    if [[ "$ENVIRONMENT" == *"production"* ]] && [[ "$RECORD_COUNT" -gt 1000 ]]; then
        echo "   Decision: ⚠️  Tier 2 in production with >1k records - governance required"
    else
        echo "   Decision: ⚠️  Tier 2 - governance check"
    fi
fi

# Tier 3+: Always require governance check
if [[ "$AGENT_TIER" -ge 3 ]]; then
    echo "   Decision: ⚠️  Tier $AGENT_TIER - governance required"
fi

###############################################################################
# Calculate risk score
###############################################################################

if [[ ! -f "$RISK_SCORER" ]]; then
    echo -e "${YELLOW}⚠️  Risk scorer not found, proceeding with caution${NC}"
    exit 0
fi

echo ""
echo "📊 Calculating risk score..."

# Build risk calculation command
RISK_CMD="node \"$RISK_SCORER\" \
    --type \"$OPERATION_TYPE\" \
    --agent \"$AGENT_NAME\" \
    --environment \"$ENVIRONMENT\" \
    --record-count \"$RECORD_COUNT\" \
    --component-count \"$COMPONENT_COUNT\""

# Execute risk calculation
RISK_OUTPUT=$(eval $RISK_CMD 2>&1) || {
    echo -e "${YELLOW}⚠️  Risk calculation failed, proceeding with caution${NC}"
    exit 0
}

# Parse risk results
RISK_SCORE=$(echo "$RISK_OUTPUT" | jq -r '.riskScore // 0' 2>/dev/null || echo "0")
RISK_LEVEL=$(echo "$RISK_OUTPUT" | jq -r '.riskLevel // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
BLOCKED=$(echo "$RISK_OUTPUT" | jq -r '.blocked // false' 2>/dev/null || echo "false")
REQUIRES_APPROVAL=$(echo "$RISK_OUTPUT" | jq -r '.requiresApproval // false' 2>/dev/null || echo "false")

echo "   Risk Score: $RISK_SCORE/100 ($RISK_LEVEL)"

###############################################################################
# Handle CRITICAL risk (blocked operations)
###############################################################################

if [[ "$BLOCKED" == "true" ]] || [[ "$RISK_SCORE" -ge 71 ]]; then
    # Log blocked operation
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Operation blocked - CRITICAL risk" \
        "{\"agent\":\"$AGENT_NAME\",\"tier\":$AGENT_TIER,\"riskScore\":$RISK_SCORE,\"riskLevel\":\"$RISK_LEVEL\",\"environment\":\"$ENVIRONMENT\",\"operationType\":\"$OPERATION_TYPE\"}"

    if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
            "Operation Blocked - CRITICAL Risk" \
            "This operation exceeds the CRITICAL risk threshold and cannot proceed without executive approval" \
            "Agent:$AGENT_NAME,Tier:$AGENT_TIER,Risk Score:$RISK_SCORE/100,Risk Level:$RISK_LEVEL,Environment:$ENVIRONMENT,Operation:$OPERATION_TYPE" \
            "Detailed business justification required,Executive approval (2+ approvers) required,Comprehensive rollback plan required,Test in full sandbox first,Backup affected data if destructive,Request approval: node $PLUGIN_ROOT/scripts/lib/human-in-the-loop-controller.js request <approval-request.json>" \
            "Emergency override: export AGENT_GOVERNANCE_OVERRIDE=true; OVERRIDE_REASON=\"ticket #XXXXX\"; OVERRIDE_APPROVER=\"your-email\""
        exit 1
    else
        echo ""
        echo -e "${RED}❌ OPERATION BLOCKED${NC}"
        echo "   Risk Score: $RISK_SCORE/100 ($RISK_LEVEL)"
        echo "   Reason: Exceeds CRITICAL risk threshold (71)"
        echo ""
        echo "   This operation requires:"
        echo "   1. Detailed business justification"
        echo "   2. Executive approval (2+ approvers)"
        echo "   3. Comprehensive rollback plan"
        echo "   4. Testing in full sandbox first"
        echo "   5. Backup of affected data (if destructive)"
        echo ""
        echo "   To request approval:"
        echo "   node $PLUGIN_ROOT/scripts/lib/human-in-the-loop-controller.js request <approval-request.json>"
        echo ""
        echo "   For emergency override (use with extreme caution):"
        echo "   export AGENT_GOVERNANCE_OVERRIDE=true"
        echo "   export OVERRIDE_REASON=\"Production outage - ticket #XXXXX\""
        echo "   export OVERRIDE_APPROVER=\"your-email@example.com\""
        echo ""
        exit 1
    fi
fi

###############################################################################
# Handle HIGH risk (approval required)
###############################################################################

# Check tier-based approval requirements
TIER_REQUIRES_APPROVAL="false"

if [[ "$AGENT_TIER" == "4" ]] || [[ "$AGENT_TIER" == "5" ]]; then
    # Tier 4-5 always require approval
    TIER_REQUIRES_APPROVAL="true"
elif [[ "$AGENT_TIER" == "3" ]] && [[ "$ENVIRONMENT" == *"production"* ]]; then
    # Tier 3 requires approval in production
    TIER_REQUIRES_APPROVAL="true"
fi

# Check if approval needed (risk-based OR tier-based)
if [[ "$REQUIRES_APPROVAL" == "true" ]] || [[ "$TIER_REQUIRES_APPROVAL" == "true" ]]; then
    # Determine approvers based on tier
    if [[ "$AGENT_TIER" == "5" ]]; then
        APPROVERS="Director + VP (executive approval)"
    elif [[ "$AGENT_TIER" == "4" ]]; then
        APPROVERS="Security-lead + one other"
    elif [[ "$AGENT_TIER" == "3" ]]; then
        if [[ "$OPERATION_TYPE" == *"APEX"* ]] || [[ "$OPERATION_TYPE" == *"TRIGGER"* ]]; then
            APPROVERS="Architect"
        else
            APPROVERS="Team-lead"
        fi
    else
        APPROVERS="Team-lead"
    fi

    # Log approval requirement
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Approval required before proceeding" \
        "{\"agent\":\"$AGENT_NAME\",\"tier\":$AGENT_TIER,\"riskScore\":$RISK_SCORE,\"riskLevel\":\"$RISK_LEVEL\",\"environment\":\"$ENVIRONMENT\",\"approvers\":\"$APPROVERS\"}"

    # In non-interactive mode (CI/CD), block with error
    if [[ ! -t 0 ]] || [[ -n "${CI:-}" ]]; then
        if [ -f "$OUTPUT_FORMATTER" ]; then
            node "$OUTPUT_FORMATTER" error \
                "Approval Required - Non-Interactive Environment" \
                "This operation requires approval but is running in CI/CD mode" \
                "Agent:$AGENT_NAME,Tier:$AGENT_TIER,Risk:$RISK_SCORE/100 ($RISK_LEVEL),Environment:$ENVIRONMENT,Approvers:$APPROVERS" \
                "Create approval request file,Submit via: node $PLUGIN_ROOT/scripts/lib/human-in-the-loop-controller.js request approval-request.json,Include detailed reasoning and rollback plan" \
                "Non-interactive environment detected"
            exit 1
        else
            echo ""
            echo "   Non-interactive environment detected."
            echo "   Create approval request file and submit manually:"
            echo ""
            echo "   node $PLUGIN_ROOT/scripts/lib/human-in-the-loop-controller.js request approval-request.json"
            exit 1
        fi
    fi

    # Interactive mode - show warning with exit code 2
    if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
            "Approval Required" \
            "This operation requires approval before proceeding" \
            "Agent:$AGENT_NAME,Tier:$AGENT_TIER,Risk Score:$RISK_SCORE/100,Risk Level:$RISK_LEVEL,Environment:$ENVIRONMENT,Required Approvers:$APPROVERS" \
            "Agent will request approval when attempting operation,Provide detailed reasoning and rollback plan,Ensure approvers are available" \
            ""
        exit 2
    else
        echo ""
        echo -e "${YELLOW}⚠️  APPROVAL REQUIRED${NC}"
        echo "   Risk Score: $RISK_SCORE/100 ($RISK_LEVEL)"
        echo "   Agent Tier: $AGENT_TIER"
        echo "   Environment: $ENVIRONMENT"
        echo "   Required Approvers: $APPROVERS"
        echo ""
        echo "   ⚠️  This operation requires approval before proceeding."
        echo "   The agent will request approval when it attempts the operation."
        echo ""
    fi
fi

###############################################################################
# MEDIUM/LOW risk - proceed with logging
###############################################################################

if [[ "$RISK_LEVEL" == "MEDIUM" ]]; then
    echo -e "${GREEN}✅ PROCEEDING${NC} (MEDIUM risk)"
    echo "   Enhanced logging and monitoring enabled"
elif [[ "$RISK_LEVEL" == "LOW" ]]; then
    echo -e "${GREEN}✅ PROCEEDING${NC} (LOW risk)"
    echo "   Standard logging enabled"
fi

echo ""

# Exit successfully to allow operation
exit 0
