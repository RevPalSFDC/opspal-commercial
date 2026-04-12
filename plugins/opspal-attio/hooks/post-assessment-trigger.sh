#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Post-Assessment Trigger Hook - Attio Plugin
#
# Trigger:  SubagentStop
# Matcher:  attio-assessment-analyzer
# Purpose:  Package assessment deliverables after the assessment agent
#           completes. Saves the assessment result to history, emits an
#           audit event, and surfaces next-step guidance to the user.
#
# Behavior:
#   - Reads hook input JSON from stdin (subagent_type or agent_name)
#   - Only fires for attio-assessment-analyzer subagent
#   - Calls scripts/lib/assessment-history-tracker.js to persist the
#     assessment (if the script is available)
#   - Calls scripts/lib/emit-automation-event.js to write an audit event
#     to events.jsonl (if available)
#   - Emits additionalContext suggesting next steps (workspace report command)
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "SubagentStop",
#                             "additionalContext": "..." } }
#
# Exit Codes:
#   0 - Always exits 0
#
# Version: 1.0.0
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
    set_lenient_mode 2>/dev/null || true
fi

# ── Emit helpers ──────────────────────────────────────────────────────────────

emit_noop() {
    printf '{}\n' >&3
}

emit_context() {
    local context="$1"

    if ! command -v jq >/dev/null 2>&1; then
        emit_noop
        return 0
    fi

    jq -nc \
        --arg context "$context" \
        '{
          hookSpecificOutput: {
            hookEventName: "SubagentStop",
            additionalContext: $context
          }
        }' >&3
}

# ── Read stdin ────────────────────────────────────────────────────────────────
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

if [[ -z "$HOOK_INPUT" ]]; then
    emit_noop
    exit 0
fi

# ── Parse agent name ──────────────────────────────────────────────────────────
AGENT_NAME=""

if command -v jq >/dev/null 2>&1; then
    AGENT_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.subagent_type // .agent_name // .agent // .tool_input.subagent_type // empty' 2>/dev/null || true)"
else
    AGENT_NAME="$(printf '%s' "$HOOK_INPUT" | grep -oP '"subagent_type"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || \
                  printf '%s' "$HOOK_INPUT" | grep -oP '"agent_name"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || echo '')"
fi

# ── Only fire for attio-assessment-analyzer ───────────────────────────────────
if [[ "$AGENT_NAME" != "attio-assessment-analyzer" ]]; then
    emit_noop
    exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "✅ ATTIO ASSESSMENT COMPLETE — Post-Assessment Trigger" >&2
echo "   Agent: ${AGENT_NAME}" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Resolve workspace name for output paths ───────────────────────────────────
WORKSPACE_NAME="default"
if command -v jq >/dev/null 2>&1; then
    WS_NAME_FROM_ENV="${ATTIO_WORKSPACE_NAME:-}"
    if [[ -n "$WS_NAME_FROM_ENV" ]]; then
        WORKSPACE_NAME="$WS_NAME_FROM_ENV"
    elif [[ -f "${PLUGIN_ROOT}/workspaces/config.json" ]]; then
        WORKSPACE_NAME="$(jq -r '.active_workspace // "default"' "${PLUGIN_ROOT}/workspaces/config.json" 2>/dev/null || echo 'default')"
    fi
fi

ASSESSMENT_DIR="${PLUGIN_ROOT}/workspaces/${WORKSPACE_NAME}/assessments"

# ── Persist assessment history (if script available) ─────────────────────────
HISTORY_TRACKER="${PLUGIN_ROOT}/scripts/lib/assessment-history-tracker.js"
HISTORY_SAVED=false

if [[ -f "$HISTORY_TRACKER" ]] && command -v node >/dev/null 2>&1; then
    echo "  Saving assessment to history..." >&2
    node "$HISTORY_TRACKER" \
        --workspace "${WORKSPACE_NAME}" \
        --agent "${AGENT_NAME}" \
        --timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        2>/dev/null && HISTORY_SAVED=true || true
    if [[ "$HISTORY_SAVED" == "true" ]]; then
        echo "  Assessment saved to ${ASSESSMENT_DIR}/" >&2
    fi
else
    echo "  assessment-history-tracker.js not found — skipping history save." >&2
fi

# ── Emit automation event (if available) ─────────────────────────────────────
EMIT_SCRIPT="${PLUGIN_ROOT}/scripts/lib/emit-automation-event.js"

if [[ -f "$EMIT_SCRIPT" ]] && command -v node >/dev/null 2>&1; then
    node "$EMIT_SCRIPT" \
        --event "assessment_completed" \
        --agent "${AGENT_NAME}" \
        --workspace "${WORKSPACE_NAME}" \
        --timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        2>/dev/null || true
fi

# ── Emit next-step advisory context ──────────────────────────────────────────
CONTEXT_MSG="Assessment complete. Results saved to workspaces/${WORKSPACE_NAME}/assessments/. Run /attio-workspace-report for a formatted report."

if [[ "$HISTORY_SAVED" == "true" ]]; then
    CONTEXT_MSG="${CONTEXT_MSG} Assessment history was recorded to ${ASSESSMENT_DIR}/."
fi

CONTEXT_MSG="${CONTEXT_MSG} Next steps: (1) Review the assessment findings in workspaces/${WORKSPACE_NAME}/assessments/. (2) Run /attio-workspace-report to generate a formatted executive summary. (3) For data quality issues flagged in the assessment, delegate to attio-data-hygiene-specialist. (4) For governance or change-control recommendations, delegate to attio-governance-enforcer."

emit_context "$CONTEXT_MSG"
exit 0
