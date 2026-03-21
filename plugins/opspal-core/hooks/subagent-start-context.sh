#!/bin/bash
#
# SubagentStart Hook - Unified Context Injection
#
# Purpose: Inject org-specific context when a sub-agent process starts.
#          Consolidates logic previously split across 4 PreToolUse hooks:
#            - pre-task-runbook-reminder.sh (runbook references)
#            - pre-task-template-injector.sh (template/branding guidance)
#            - pre-task-field-dictionary-injector.sh (field semantics)
#            - pre-task-work-context.sh (client work history)
#
#          Returns additionalContext JSON to inject into agent prompt.
#
# Note: pre-task-agent-validator.sh remains in PreToolUse because it must
#       block before invocation, not just inject context.
#
# Timeout: 10000ms
#
# Version: 1.0.0
# Created: 2026-02-06

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
TASK_SCOPE_SELECTOR="$PLUGIN_ROOT/scripts/lib/task-scope-selector.js"

emit_noop_json() {
  printf '{}\n'
}

# Read hook input from stdin
INPUT=$(cat)

# Extract agent name
AGENT_NAME=$(echo "$INPUT" | jq -r '.agent_type // .subagent_type // .agentName // ""' 2>/dev/null)

# Skip if no agent identified
if [[ -z "$AGENT_NAME" ]]; then
    emit_noop_json
    exit 0
fi

# Initialize context parts
CONTEXT_PARTS=()

# ─── 0. Task Scope Guidance ──────────────────────────────────────────────────
if [[ -f "$TASK_SCOPE_SELECTOR" ]] && command -v node >/dev/null 2>&1; then
    TASK_SCOPE_CONTEXT=$(printf '%s' "$INPUT" | node "$TASK_SCOPE_SELECTOR" from-hook --format subagent-context 2>/dev/null || true)
    if [[ -n "${TASK_SCOPE_CONTEXT// }" ]]; then
        CONTEXT_PARTS+=("$TASK_SCOPE_CONTEXT")
    fi
fi

# ─── 1. Runbook Reminder ───────────────────────────────────────────────────
if [[ "${RUNBOOK_REMINDER_ENABLED:-1}" == "1" ]]; then
    ORG_SLUG="${ORG_SLUG:-}"
    SF_TARGET_ORG="${SF_TARGET_ORG:-}"
    ORG="${ORG_SLUG:-$SF_TARGET_ORG}"

    if [[ -n "$ORG" ]]; then
        # Search for runbook in standard locations
        RUNBOOK_PATHS=(
            "$PROJECT_ROOT/orgs/$ORG/platforms/salesforce/production/configs/RUNBOOK.md"
            "$PROJECT_ROOT/orgs/$ORG/platforms/salesforce/production/RUNBOOK.md"
            "$PROJECT_ROOT/orgs/$ORG/RUNBOOK.md"
        )

        for rb_path in "${RUNBOOK_PATHS[@]}"; do
            if [[ -f "$rb_path" ]]; then
                # Extract key sections (first 500 chars)
                SUMMARY=$(head -c 500 "$rb_path" 2>/dev/null || true)
                CONTEXT_PARTS+=("RUNBOOK ($ORG): Review before proceeding. Path: $rb_path")
                break
            fi
        done
    fi
fi

# ─── 2. Template/Branding Injection ────────────────────────────────────────
if [[ "${TEMPLATE_INJECTION_ENABLED:-1}" == "1" ]]; then
    REGISTRY="${PLUGIN_ROOT}/config/master-template-registry.json"
    if [[ -f "$REGISTRY" ]] && command -v jq &> /dev/null; then
        # Check if agent has template recommendations
        TEMPLATES=$(jq -r --arg agent "$AGENT_NAME" '.agents[$agent] // empty' "$REGISTRY" 2>/dev/null)
        if [[ -n "$TEMPLATES" ]]; then
            CONTEXT_PARTS+=("TEMPLATES: Use RevPal branding. See config/master-template-registry.json for agent-specific templates.")
        fi
    fi
fi

# ─── 3. Field Dictionary Injection ─────────────────────────────────────────
if [[ "${FIELD_DICT_INJECTION_ENABLED:-1}" == "1" ]]; then
    ORG_SLUG="${ORG_SLUG:-}"

    # Only inject for reporting/assessment agents
    REPORTING_AGENTS="sfdc-reports-dashboards|sfdc-report-designer|pipeline-intelligence|unified-exec-dashboard|gtm-strategic-reports|gtm-retention-analyst|sfdc-revops-auditor|sfdc-cpq-assessor|sfdc-dashboard-designer"

    if [[ -n "$ORG_SLUG" ]] && echo "$AGENT_NAME" | grep -qE "$REPORTING_AGENTS"; then
        DICT_PATH="$PROJECT_ROOT/orgs/$ORG_SLUG/configs/field-dictionary.yaml"
        if [[ -f "$DICT_PATH" ]]; then
            CONTEXT_PARTS+=("FIELD DICTIONARY: Available at $DICT_PATH - use for field semantics, caveats, and reporting guidance.")
        fi
    fi
fi

# ─── 4. Work Context ──────────────────────────────────────────────────────
if [[ "${WORK_CONTEXT_ENABLED:-1}" == "1" ]]; then
    ORG_SLUG="${ORG_SLUG:-}"

    if [[ -n "$ORG_SLUG" ]]; then
        WORK_INDEX="$PROJECT_ROOT/orgs/$ORG_SLUG/WORK_INDEX.yaml"
        if [[ -f "$WORK_INDEX" ]]; then
            # Get recent work entries (last 5 lines with status)
            RECENT=$(tail -20 "$WORK_INDEX" 2>/dev/null | grep -E "title:|status:|classification:" | tail -6 || true)
            if [[ -n "$RECENT" ]]; then
                CONTEXT_PARTS+=("RECENT WORK ($ORG_SLUG): $RECENT")
            fi
        fi
    fi
fi

# ─── Build Output ──────────────────────────────────────────────────────────
if [[ ${#CONTEXT_PARTS[@]} -gt 0 ]]; then
    # Join context parts
    JOINED=""
    for part in "${CONTEXT_PARTS[@]}"; do
        if [[ -n "$JOINED" ]]; then
            JOINED="${JOINED}\n\n${part}"
        else
            JOINED="$part"
        fi
    done

    # Return context using SubagentStart hook contract
    jq -n \
      --arg context "$(echo -e "$JOINED")" \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "SubagentStart",
          additionalContext: $context
        }
      }'
else
    emit_noop_json
fi

exit 0
