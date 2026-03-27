#!/usr/bin/env bash

# Post-Investigation Execution Proof Hook v2.0
#
# SubagentStop hook for execution-class Salesforce investigation specialists.
# Verifies that the specialist produced a valid execution receipt from real
# query execution, rather than relying on text heuristics.
#
# Verification strategy (ordered):
#   1. RECEIPT-PRIMARY: Extract and verify execution receipt (deterministic)
#   2. HEURISTIC-FALLBACK: Score text evidence if no receipt found (diagnostic only)
#
# Receipt verification checks:
#   - Receipt marker present in output
#   - JSON structure parseable
#   - Integrity hash matches re-computed hash (SHA-256)
#   - Timestamp within freshness window (30 min)
#   - At least one query was attempted
#   - Version and type fields match expected values
#
# Covered agents:
#   sfdc-automation-auditor
#   sfdc-territory-discovery
#   sfdc-discovery
#   sfdc-state-discovery
#
# Exit codes:
#   0 - Pass or non-investigation agent
#   0 + additionalContext - Proof failure (warning injected to parent)
#
# Hook Type: SubagentStop
# Version: 2.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Resolve receipt verifier — check opspal-core (canonical) first, then salesforce (compat)
RECEIPT_LIB_DIR=""
for candidate in \
  "${PLUGIN_ROOT}/scripts/lib" \
  "${PLUGIN_ROOT}/../opspal-salesforce/scripts/lib" \
  "${HOME}/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/lib" \
  "${HOME}/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-salesforce/scripts/lib" \
  "${HOME}/.claude/plugins/cache/opspal-commercial/opspal-core/"*/scripts/lib \
  "${HOME}/.claude/plugins/cache/opspal-commercial/opspal-salesforce/"*/scripts/lib; do
  if [[ -f "${candidate}/execution-receipt.js" ]]; then
    RECEIPT_LIB_DIR="$candidate"
    break
  fi
done

# Read sub-agent output from stdin
SUBAGENT_OUTPUT=$(cat 2>/dev/null || true)

# Skip if output is too short
if [[ ${#SUBAGENT_OUTPUT} -lt 100 ]]; then
    exit 0
fi

# Detect which agent produced this output
detect_agent_name() {
    local output="$1"
    for agent in sfdc-automation-auditor sfdc-territory-discovery sfdc-discovery sfdc-state-discovery hubspot-assessment-analyzer hubspot-workflow-auditor marketo-automation-auditor marketo-instance-discovery marketo-analytics-assessor marketo-lead-quality-assessor; do
        if echo "$output" | grep -qi "$agent" 2>/dev/null; then
            echo "$agent"
            return 0
        fi
    done
    echo ""
}

AGENT_NAME=$(detect_agent_name "$SUBAGENT_OUTPUT")
if [[ -z "$AGENT_NAME" ]]; then
    AGENT_NAME="${CLAUDE_AGENT_NAME:-}"
fi

# Only enforce for known investigation specialists
case "$AGENT_NAME" in
    sfdc-automation-auditor|sfdc-territory-discovery|sfdc-discovery|sfdc-state-discovery|hubspot-assessment-analyzer|hubspot-workflow-auditor|marketo-automation-auditor|marketo-instance-discovery|marketo-analytics-assessor|marketo-lead-quality-assessor)
        ;;
    *)
        exit 0
        ;;
esac

# ====================================================================
# TIER 1: Receipt-based verification (deterministic, primary path)
# ====================================================================

RECEIPT_FOUND="false"
RECEIPT_VALID="false"
RECEIPT_CLASSIFICATION=""
RECEIPT_REASON=""

if [[ -n "$RECEIPT_LIB_DIR" ]] && command -v node &>/dev/null; then
    # Run verifier — capture only the first line of stdout (the JSON result)
    VERIFY_RESULT=$(echo "$SUBAGENT_OUTPUT" | node "$RECEIPT_LIB_DIR/execution-receipt.js" verify 2>/dev/null || true)

    if [[ -n "$VERIFY_RESULT" ]] && echo "$VERIFY_RESULT" | grep -q '"classification"' 2>/dev/null; then
        RECEIPT_VALID=$(echo "$VERIFY_RESULT" | grep -oP '"valid"\s*:\s*\K(true|false)' 2>/dev/null || echo "false")
        RECEIPT_CLASSIFICATION=$(echo "$VERIFY_RESULT" | grep -oP '"classification"\s*:\s*"\K[^"]+' 2>/dev/null || echo "unknown")
        RECEIPT_REASON=$(echo "$VERIFY_RESULT" | grep -oP '"reason"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")

        # missing_receipt means no receipt marker was found in the output.
        # This is NOT a receipt validation failure — fall through to heuristics.
        if [[ "$RECEIPT_CLASSIFICATION" != "missing_receipt" ]]; then
            RECEIPT_FOUND="true"
        fi
    fi
fi

# If receipt found and valid — PASS
if [[ "$RECEIPT_VALID" == "true" ]]; then
    exit 0
fi

# If receipt found but invalid — HARD FAIL with specific classification
if [[ "$RECEIPT_FOUND" == "true" ]] && [[ "$RECEIPT_VALID" != "true" ]]; then
    MESSAGE="INVESTIGATION_RECEIPT_INVALID: Specialist '${AGENT_NAME}' returned an execution receipt but verification failed. Classification: ${RECEIPT_CLASSIFICATION}. Reason: ${RECEIPT_REASON}. Do NOT accept this result as completed execution. Re-delegate with explicit execution instructions or report the integrity failure to the user."

    if command -v jq &>/dev/null; then
        jq -n --arg context "$MESSAGE" \
          '{ suppressOutput: true, hookSpecificOutput: { hookEventName: "SubagentStop", additionalContext: $context } }'
    else
        echo "$MESSAGE" >&2
    fi
    exit 0
fi

# ====================================================================
# TIER 2: Heuristic fallback (when receipt infrastructure not available)
# ====================================================================

# This is the diagnostic-only fallback for when:
# - The execution-receipt.js library is not found
# - The specialist used a code path that doesn't emit receipts yet
# - Node.js is unavailable in the hook environment

EXECUTION_EVIDENCE=0
PLAN_ONLY_EVIDENCE=0

# Positive evidence
if echo "$SUBAGENT_OUTPUT" | grep -qiE '(found|retrieved|returned|queried)\s+[0-9]+\s+(record|flow|trigger|rule|class|territor|object|component|process)'; then
    EXECUTION_EVIDENCE=$((EXECUTION_EVIDENCE + 2))
fi
if echo "$SUBAGENT_OUTPUT" | grep -qiE '"totalSize"\s*:\s*[0-9]+|"records"\s*:\s*\[|result\.records|"total"\s*:\s*[0-9]+|"results"\s*:\s*\[|"moreResult"|"paginationToken"'; then
    EXECUTION_EVIDENCE=$((EXECUTION_EVIDENCE + 2))
fi
if echo "$SUBAGENT_OUTPUT" | grep -qiE '(Success|completed).*[0-9]+\s+(record|row|result)'; then
    EXECUTION_EVIDENCE=$((EXECUTION_EVIDENCE + 2))
fi
if echo "$SUBAGENT_OUTPUT" | grep -qiE 'INVALID_FIELD|sObject type.*not supported|INSUFFICIENT_ACCESS|INVALID_TYPE|QUERY_TIMEOUT|401.*Unauthorized|403.*Forbidden|rate.limit|quota.exceeded|API_LIMIT|MARKETO_ERROR'; then
    EXECUTION_EVIDENCE=$((EXECUTION_EVIDENCE + 1))
fi

# Negative evidence
if echo "$SUBAGENT_OUTPUT" | grep -qiE '(here are|following|these are|suggested|recommended)\s+(the\s+)?(quer|SOQL|command|step)'; then
    PLAN_ONLY_EVIDENCE=$((PLAN_ONLY_EVIDENCE + 2))
fi
if echo "$SUBAGENT_OUTPUT" | grep -qiE '(should|would need to|could) be (run|executed|queried|performed)'; then
    PLAN_ONLY_EVIDENCE=$((PLAN_ONLY_EVIDENCE + 2))
fi

# Decision
if [[ $EXECUTION_EVIDENCE -ge 2 ]] && [[ $EXECUTION_EVIDENCE -gt $PLAN_ONLY_EVIDENCE ]]; then
    # Heuristic pass — but warn about missing receipt
    MESSAGE="INVESTIGATION_RECEIPT_MISSING_HEURISTIC_PASS: Specialist '${AGENT_NAME}' did not include an execution receipt, but text heuristics suggest execution occurred (evidence: ${EXECUTION_EVIDENCE}, plan-only: ${PLAN_ONLY_EVIDENCE}). This is a WEAK pass. For deterministic proof, the specialist should use investigation-fan-out.js or safeExecMultipleQueries which generate receipts automatically."

    if command -v jq &>/dev/null; then
        jq -n --arg context "$MESSAGE" \
          '{ suppressOutput: true, hookSpecificOutput: { hookEventName: "SubagentStop", additionalContext: $context } }'
    else
        echo "$MESSAGE" >&2
    fi
    exit 0
fi

# No receipt AND heuristic failure — FAIL
if [[ $PLAN_ONLY_EVIDENCE -ge 2 ]] && [[ $EXECUTION_EVIDENCE -lt 2 ]]; then
    MESSAGE="INVESTIGATION_EXECUTION_PROOF_MISSING: Specialist '${AGENT_NAME}' returned no execution receipt and appears to have returned a query plan without executing. Plan-only: ${PLAN_ONLY_EVIDENCE}, Execution: ${EXECUTION_EVIDENCE}. The specialist MUST execute approved read-only queries and include the execution receipt in output. Do NOT run these queries from the parent context. Re-delegate or report the failure."
elif [[ $EXECUTION_EVIDENCE -lt 2 ]]; then
    MESSAGE="INVESTIGATION_EXECUTION_PROOF_WEAK: Specialist '${AGENT_NAME}' returned no execution receipt and execution evidence is insufficient (score: ${EXECUTION_EVIDENCE}). Do NOT supplement with direct parent queries — re-delegate if needed."
else
    exit 0
fi

if command -v jq &>/dev/null; then
    jq -n --arg context "$MESSAGE" \
      '{ suppressOutput: true, hookSpecificOutput: { hookEventName: "SubagentStop", additionalContext: $context } }'
else
    echo "$MESSAGE" >&2
fi

exit 0
