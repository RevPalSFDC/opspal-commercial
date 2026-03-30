#!/usr/bin/env bash
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
# Version: 1.1.0
# Created: 2026-02-06
# Updated: 2026-03-24 - Added org alias pre-flight validation

set -euo pipefail

if ! command -v jq &>/dev/null; then
    printf '{}\n'
    exit 0
fi

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

# ─── 0b. Org Alias Pre-Flight Validation ─────────────────────────────────────
# For Salesforce-scoped agents, validate that the org alias in the prompt exists.
# This catches wrong-alias errors before the sub-agent wastes a full run.
if [[ "${SUBAGENT_ORG_PREFLIGHT:-1}" == "1" ]]; then
    SF_AGENT_PATTERN="sfdc-|salesforce|trigger-|validation-rule-|permission-|flow-"
    if echo "$AGENT_NAME" | grep -qiE "$SF_AGENT_PATTERN"; then
        # Extract org alias from the agent's prompt
        AGENT_PROMPT=$(echo "$INPUT" | jq -r '.prompt // .message // .description // ""' 2>/dev/null || echo "")

        if [[ -n "$AGENT_PROMPT" ]]; then
            # Look for --target-org or -o flags in the prompt
            PROMPT_ORG=$(echo "$AGENT_PROMPT" | grep -oP '(?:--target-org|-o)\s+(\S+)' | head -1 | awk '{print $NF}' || true)

            # Also look for "Target org: <alias>" or "org alias: <alias>" patterns
            if [[ -z "$PROMPT_ORG" ]]; then
                PROMPT_ORG=$(echo "$AGENT_PROMPT" | grep -oiP '(?:target\s+org|org\s+alias)[:\s]+(\S+)' | head -1 | awk '{print $NF}' || true)
            fi

            if [[ -n "$PROMPT_ORG" ]] && command -v sf &>/dev/null; then
                # Quick check: does this alias exist in authenticated orgs?
                # Use timeout to avoid blocking if sf is slow
                ORG_LIST=$(timeout 5 sf org list --json 2>/dev/null || echo '{"result":[]}')
                ALIAS_EXISTS=$(echo "$ORG_LIST" | jq -r --arg alias "$PROMPT_ORG" '
                    [.result[]? | select(.alias == $alias or .username == $alias)] | length
                ' 2>/dev/null || echo "0")

                if [[ "$ALIAS_EXISTS" == "0" ]]; then
                    # Find similar aliases for suggestions
                    SIMILAR=$(echo "$ORG_LIST" | jq -r --arg alias "$PROMPT_ORG" '
                        [.result[]?.alias // empty] | map(select(. != null and . != "")) |
                        map(select(ascii_downcase | contains($alias | ascii_downcase) or
                                   ($alias | ascii_downcase | contains(. | ascii_downcase)))) |
                        .[0:3] | join(", ")
                    ' 2>/dev/null || echo "")

                    WARNING_MSG="ORG_ALIAS_WARNING: Org alias '${PROMPT_ORG}' was not found in authenticated orgs."
                    if [[ -n "$SIMILAR" ]]; then
                        WARNING_MSG="${WARNING_MSG} Similar aliases found: ${SIMILAR}. Verify the correct alias before running sf CLI commands."
                    else
                        WARNING_MSG="${WARNING_MSG} Run \`sf org list\` to see available orgs."
                    fi
                    CONTEXT_PARTS+=("$WARNING_MSG")
                fi
            fi
        fi
    fi
fi

# ─── 1. Runbook & branding reminders migrated to CLAUDE.md ─────────────────
# Runbook path reminders and "Use RevPal branding" instructions are now in
# per-plugin CLAUDE.md files. Only runtime-dynamic context remains here.

# ─── 2. Field Dictionary Injection ─────────────────────────────────────────
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
