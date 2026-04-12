#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Universal Agent Governance Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  Agent
# Purpose:  Governance gate for Attio agent launches. Scores the agent name and
#           prompt for destructive or bulk-mutating risk, then emits advisory
#           context. Advisory only — always allows; never denies.
#
# Behavior:
#   - Reads hook input JSON from stdin (tool_input.subagent_type, tool_input.prompt)
#   - Skips non-Attio agents immediately
#   - Scores prompt for risk indicators:
#       CRITICAL: "delete all", "remove all", "bulk delete"
#       HIGH:     bulk/mutating operations at workspace scale
#       MEDIUM:   "update all", "modify all"
#       LOW:      pass-through with empty context
#   - Emits permissionDecision: "allow" with appropriate advisory reason
#
# Rationale:
#   Per the OpsPal routing advisory policy, hooks MUST NOT deny tool execution.
#   Governance is advisory only. Audit logging is written to .claude/logs/hooks/.
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PreToolUse",
#                             "permissionDecision": "allow",
#                             "permissionDecisionReason": "..." } }
#
# Exit Codes:
#   0 - Always exits 0
#
# Version: 1.0.0
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "${PLUGIN_ROOT}/hooks/lib/error-handler.sh" ]]; then
    source "${PLUGIN_ROOT}/hooks/lib/error-handler.sh"
    set_lenient_mode 2>/dev/null || true
fi

GOVERNANCE_ENABLED="${ATTIO_AGENT_GOVERNANCE_ENABLED:-true}"

# ── Emit helpers ──────────────────────────────────────────────────────────────

emit_noop() {
    printf '{}\n' >&3
}

emit_pretool_response() {
    local permission_decision="$1"
    local permission_reason="$2"
    local additional_context="${3:-}"

    if ! command -v jq >/dev/null 2>&1; then
        emit_noop
        return 0
    fi

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
        }' >&3
}

# ── Short-circuit if governance disabled ─────────────────────────────────────
if [[ "$GOVERNANCE_ENABLED" != "true" ]]; then
    emit_noop
    exit 0
fi

# ── Read stdin ────────────────────────────────────────────────────────────────
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

# ── Parse agent name and prompt ───────────────────────────────────────────────
AGENT_NAME="${CLAUDE_AGENT_NAME:-${CLAUDE_TASK_AGENT:-unknown}}"
PROMPT="${CLAUDE_TASK_PROMPT:-}"

if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    AGENT_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // empty' 2>/dev/null || echo "$AGENT_NAME")"
    PROMPT="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // empty' 2>/dev/null || echo "$PROMPT")"
fi

AGENT_NAME_LOWER="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"
PROMPT_LOWER="$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')"

# ── Skip non-Attio agents ─────────────────────────────────────────────────────
if ! printf '%s' "$AGENT_NAME_LOWER" | grep -q 'attio'; then
    emit_noop
    exit 0
fi

# Skip governance/validator meta-agents
case "$AGENT_NAME_LOWER" in
    *governance*|*validator*|unknown)
        emit_noop
        exit 0
        ;;
esac

# ── Risk scoring ──────────────────────────────────────────────────────────────
RISK_LEVEL="LOW"
RISK_REASON=""

# CRITICAL — mass-destructive patterns
if printf '%s' "$PROMPT_LOWER" | grep -qE '(delete all|remove all|bulk delete|purge|wipe workspace|clear all data|destroy all)'; then
    RISK_LEVEL="CRITICAL"
    RISK_REASON="Mass-destructive Attio operation detected. Attio has no recycle bin — deletions are permanent."
fi

# HIGH — bulk mutations at scale
if [[ "$RISK_LEVEL" == "LOW" ]]; then
    if printf '%s' "$PROMPT_LOWER" | grep -qE '(update all|modify all|bulk update|bulk upsert|mass update|workspace-wide)' && \
       printf '%s' "$PROMPT_LOWER" | grep -qE '([0-9]{4,}|all records|entire workspace|all contacts|all companies|all deals)'; then
        RISK_LEVEL="HIGH"
        RISK_REASON="Large-scale Attio bulk mutation detected"
    fi
fi

# MEDIUM — general mutating verbs on all/many records
if [[ "$RISK_LEVEL" == "LOW" ]]; then
    if printf '%s' "$PROMPT_LOWER" | grep -qE '(update all|modify all|change all|set all|reset all)'; then
        RISK_LEVEL="MEDIUM"
        RISK_REASON="Broad mutating Attio operation detected"
    fi
fi

# ── Audit logging ─────────────────────────────────────────────────────────────
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LOG_DIR="${CLAUDE_PROJECT_ROOT:-$(pwd)}/.claude/logs/hooks"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="$LOG_DIR/attio-agent-governance-$(date +%Y-%m-%d).jsonl"

if command -v jq >/dev/null 2>&1; then
    jq -nc \
        --arg ts "$TIMESTAMP" \
        --arg agent "$AGENT_NAME" \
        --arg risk "$RISK_LEVEL" \
        --arg reason "$RISK_REASON" \
        '{timestamp: $ts, agent: $agent, risk_level: $risk, reason: $reason}' \
        >> "$LOG_FILE" 2>/dev/null || true
fi

# ── Emit advisory based on risk level ────────────────────────────────────────
case "$RISK_LEVEL" in
    CRITICAL)
        echo "CRITICAL RISK ADVISORY: Attio Agent Governance" >&2
        echo "  Agent: $AGENT_NAME" >&2
        echo "  Risk: CRITICAL — $RISK_REASON" >&2
        emit_pretool_response \
            "allow" \
            "ATTIO_GOVERNANCE_ADVISORY: ${RISK_REASON}" \
            "CRITICAL ADVISORY: Agent ${AGENT_NAME} flagged for mass-destructive scope. Attio has no recycle bin — deletions are permanent and irreversible. Proceeding per agent autonomy policy. Audit log: ${LOG_FILE}."
        ;;
    HIGH)
        echo "HIGH RISK ADVISORY: Attio Agent Governance" >&2
        echo "  Agent: $AGENT_NAME" >&2
        echo "  Risk: HIGH — $RISK_REASON" >&2
        emit_pretool_response \
            "allow" \
            "ATTIO_GOVERNANCE_APPROVAL_RECOMMENDED: ${RISK_REASON}" \
            "Attio governance marked ${AGENT_NAME} as HIGH risk. Confirm approval before large-scale or irreversible operations. Attio has no recycle bin."
        ;;
    MEDIUM)
        emit_pretool_response \
            "allow" \
            "ATTIO_GOVERNANCE_NOTE: Broad mutating Attio operation detected for agent ${AGENT_NAME}. Verify scope before executing. Attio has no recycle bin." \
            ""
        ;;
    *)
        # LOW — Attio agent, no elevated risk detected
        emit_pretool_response \
            "allow" \
            "" \
            "Attio agent ${AGENT_NAME} — governance check passed (LOW risk)."
        ;;
esac

exit 0
