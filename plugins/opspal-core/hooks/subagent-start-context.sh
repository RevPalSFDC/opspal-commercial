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
# Version: 1.2.0
# Created: 2026-02-06
# Updated: 2026-04-02 - Fix workspace detection (was resolving to marketplace dir),
#                        auto-detect ORG_SLUG from CWD, add staging/ runbook paths

set -euo pipefail

if ! command -v jq &>/dev/null; then
    printf '{}\n'
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TASK_SCOPE_SELECTOR="$PLUGIN_ROOT/scripts/lib/task-scope-selector.js"

# Resolve workspace root: prefer explicit env, fall back to CWD.
# The old PROJECT_ROOT derived from plugin install path pointed to the
# marketplace directory, not the user's workspace where orgs/ lives.
if [[ -n "${WORKSPACE_ROOT:-}" ]]; then
    PROJECT_ROOT="$WORKSPACE_ROOT"
elif [[ -d "$PWD/orgs" ]]; then
    PROJECT_ROOT="$PWD"
else
    # Walk up from CWD to find nearest directory containing orgs/
    _walk="$PWD"
    PROJECT_ROOT=""
    while [[ "$_walk" != "/" ]]; do
        if [[ -d "$_walk/orgs" ]]; then
            PROJECT_ROOT="$_walk"
            break
        fi
        _walk="$(dirname "$_walk")"
    done
    # Final fallback: marketplace-relative (legacy behavior)
    if [[ -z "$PROJECT_ROOT" ]]; then
        PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
    fi
fi

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
                # Use cached org list (60s TTL) to avoid 5s CLI call per subagent launch (O5 optimization)
                _ORG_LIST_CACHE="${TMPDIR:-/tmp}/sf-org-list-cache.json"
                _ORG_LIST_TTL=60
                _USE_CACHE=0
                if [[ -f "$_ORG_LIST_CACHE" ]]; then
                    _CACHE_AGE=$(( $(date +%s) - $(stat -c %Y "$_ORG_LIST_CACHE" 2>/dev/null || stat -f %m "$_ORG_LIST_CACHE" 2>/dev/null || echo 0) ))
                    [[ "$_CACHE_AGE" -lt "$_ORG_LIST_TTL" ]] && _USE_CACHE=1
                fi
                if [[ "$_USE_CACHE" == "1" ]]; then
                    ORG_LIST=$(cat "$_ORG_LIST_CACHE" 2>/dev/null || echo '{"result":[]}')
                else
                    ORG_LIST=$(timeout 5 sf org list --json 2>/dev/null || echo '{"result":[]}')
                    echo "$ORG_LIST" > "$_ORG_LIST_CACHE" 2>/dev/null || true
                fi
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

# ─── 1. Runbook Reminder ───────────────────────────────────────────────────
# Keep org-specific runbook injection at runtime so sub-agents always receive
# the exact org path without depending on static CLAUDE.md guidance.
if [[ "${RUNBOOK_REMINDER_ENABLED:-1}" == "1" ]]; then
    ORG_SLUG="${ORG_SLUG:-}"
    SF_TARGET_ORG="${SF_TARGET_ORG:-}"
    ORG="${ORG_SLUG:-$SF_TARGET_ORG}"

    # Auto-detect org slug from CWD path if not explicitly set.
    # Matches patterns like /orgs/<slug>/ or /orgs/<slug> at end of path.
    if [[ -z "$ORG" ]]; then
        ORG=$(echo "$PWD" | grep -oP '(?<=/orgs/)[^/]+' | head -1 || true)
    fi

    if [[ -n "$ORG" ]]; then
        RUNBOOK_PATHS=(
            "$PROJECT_ROOT/orgs/$ORG/platforms/salesforce/production/configs/RUNBOOK.md"
            "$PROJECT_ROOT/orgs/$ORG/platforms/salesforce/production/RUNBOOK.md"
            "$PROJECT_ROOT/orgs/$ORG/platforms/salesforce/staging/configs/RUNBOOK.md"
            "$PROJECT_ROOT/orgs/$ORG/platforms/salesforce/staging/RUNBOOK.md"
            "$PROJECT_ROOT/orgs/$ORG/RUNBOOK.md"
        )

        for rb_path in "${RUNBOOK_PATHS[@]}"; do
            if [[ -f "$rb_path" ]]; then
                CONTEXT_PARTS+=("RUNBOOK ($ORG): Review before proceeding — contains org-specific field definitions, opportunity type rules, and renewal determination logic. Path: $rb_path")
                break
            fi
        done
    fi
fi

# ─── 2. Branding reminders live in CLAUDE.md; keep runtime context dynamic ─

# ─── 3. Field Dictionary Injection ─────────────────────────────────────────
if [[ "${FIELD_DICT_INJECTION_ENABLED:-1}" == "1" ]]; then
    ORG_SLUG="${ORG_SLUG:-$ORG}"

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
    ORG_SLUG="${ORG_SLUG:-$ORG}"

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
