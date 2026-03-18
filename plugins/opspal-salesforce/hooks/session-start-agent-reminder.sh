#!/bin/bash

# Session Start Agent Reminder Hook
# Displays agent usage reminder at session start
# Ensures required directories exist

# Get script directory and calculate project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="session-start-agent-reminder"
    # Lenient mode - this hook should not block session start
    set_lenient_mode 2>/dev/null || true
fi
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$PLUGIN_DIR/../.." && pwd)"

# Use CLAUDE_PLUGIN_ROOT if available, otherwise use calculated path
if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
  PROJECT_DIR="$CLAUDE_PLUGIN_ROOT"
fi

AGENT_REMINDER_FILE="$PROJECT_DIR/.claude/AGENT_REMINDER.md"

# Ensure required temp directories exist for monitoring/reporting/caching
_TMPDIR="${TMPDIR:-/tmp}"
mkdir -p "${_TMPDIR}/salesforce-reports" 2>/dev/null
mkdir -p "${_TMPDIR}/sf-cache" 2>/dev/null
mkdir -p "${_TMPDIR}/sf-data" 2>/dev/null
mkdir -p "${_TMPDIR}/salesforce-sync" 2>/dev/null
touch "${_TMPDIR}/salesforce-reports-metrics.json" 2>/dev/null

# ============================================================================
# Org Context Auto-Detection (Phase 1.4 - Reflection Cohort Fix)
# Automatically detect Salesforce org from working directory, env vars, or CLI
# ============================================================================
ORG_CONTEXT_SCRIPT="$PLUGIN_DIR/scripts/lib/org-context-injector.js"

if command -v node &>/dev/null && [ -f "$ORG_CONTEXT_SCRIPT" ]; then
    # Detect org context (returns JSON with alias, source, etc.)
    ORG_CONTEXT_JSON=$(node "$ORG_CONTEXT_SCRIPT" 2>/dev/null || echo '{}')

    if [ -n "$ORG_CONTEXT_JSON" ] && [ "$ORG_CONTEXT_JSON" != '{}' ]; then
        # Extract alias and source using jq if available
        if command -v jq &>/dev/null; then
            DETECTED_ORG=$(echo "$ORG_CONTEXT_JSON" | jq -r '.alias // ""' 2>/dev/null || echo "")
            ORG_SOURCE=$(echo "$ORG_CONTEXT_JSON" | jq -r '.source // ""' 2>/dev/null || echo "")

            if [ -n "$DETECTED_ORG" ] && [ "$DETECTED_ORG" != "null" ]; then
                # Export for use by downstream agents and scripts
                export SF_TARGET_ORG="$DETECTED_ORG"
                export SF_ORG_SOURCE="$ORG_SOURCE"

                # Save to temp file for cross-process access
                echo "{\"alias\":\"$DETECTED_ORG\",\"source\":\"$ORG_SOURCE\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "${_TMPDIR}/sf-org-context.json"

                # Log detection (only in verbose mode)
                if [ "${VERBOSE:-0}" = "1" ]; then
                    echo "ℹ️  Detected Salesforce org: $DETECTED_ORG (source: $ORG_SOURCE)" >&2
                fi
            fi
        fi
    fi
fi

# Silent check - the reminder is in CLAUDE.md and system context
# No user-visible output needed. The .claude/ directory is gitignored so
# AGENT_REMINDER.md only exists in local dev environments - skip silently.
if [ -f "$AGENT_REMINDER_FILE" ]; then
    : # File exists, nothing to do - agents already have it in context
fi

exit 0
