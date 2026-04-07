#!/usr/bin/env bash

#
# Post-Assessment Planning Trigger (Marketo)
# Triggers implementation planning after Marketo assessment completion
#
# Delegates to the core assessment planning trigger in opspal-salesforce
# which is platform-agnostic once the assessment file is found.
#
# Usage: Called automatically via SubagentStop hook for marketo-lead-quality-assessor
#

set -e

# Read hook input from stdin if available (SubagentStop interface)
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

# Try to find the most recent Marketo assessment file
ASSESSMENT_OUTPUT=""
if [ -n "${ORG_SLUG:-}" ]; then
    ASSESSMENT_DIRS=(
        "orgs/${ORG_SLUG}/platforms/marketo/*/assessments"
        "orgs/${ORG_SLUG}/assessments"
        "instances/marketo/${ORG_SLUG}/assessments"
        "portals/${ORG_SLUG}/assessments"
    )

    for pattern in "${ASSESSMENT_DIRS[@]}"; do
        RECENT_FILE=$(find $pattern -name "*.json" -mmin -60 2>/dev/null | head -1 || echo "")
        if [ -n "$RECENT_FILE" ] && [ -f "$RECENT_FILE" ]; then
            ASSESSMENT_OUTPUT="$RECENT_FILE"
            break
        fi
    done
fi

if [ -z "$ASSESSMENT_OUTPUT" ]; then
    echo '{"status":"skipped","reason":"No Marketo assessment file found"}'
    exit 0
fi

# Delegate to the opspal-salesforce post-assessment trigger if available
# (it handles generic assessment JSON → planning context)
SFDC_HOOK="${CLAUDE_PLUGIN_ROOT}/../opspal-salesforce/hooks/post-assessment-planning-trigger.sh"
if [ -f "$SFDC_HOOK" ]; then
    echo "$HOOK_INPUT" | exec bash "$SFDC_HOOK" "$ASSESSMENT_OUTPUT"
else
    echo '{"status":"ok","assessment":"'"$ASSESSMENT_OUTPUT"'","planning":"manual"}'
    echo "📋 Marketo assessment complete: $ASSESSMENT_OUTPUT" >&2
    echo "   Run implementation planner manually — shared trigger not found" >&2
fi
