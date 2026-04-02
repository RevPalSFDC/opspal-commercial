#!/usr/bin/env bash
# post-deploy-manager-stop.sh
# SubagentStop hook for sfdc-deployment-manager.
# Detects orphaned in-flight deployments when the agent stops unexpectedly
# and surfaces the job ID + cancel command so the user can recover.
#
# Exit code: always 0 (notification hook, never blocks).

set +e
trap '' ERR

if ! command -v jq &>/dev/null; then
    exit 0
fi

INPUT=$(cat)

# Only act on failures / unexpected stops
SUCCESS=$(printf '%s' "$INPUT" | jq -r '.success // true' 2>/dev/null)
[ "$SUCCESS" = "true" ] && exit 0

# Determine which org was being targeted from state marker
MARKER_DIR="${PROJECT_ROOT:-.}/.claude/deploy-error-state"
TARGET_ORG=""
if [ -f "$MARKER_DIR/last-deploy-org.txt" ]; then
    TARGET_ORG=$(cat "$MARKER_DIR/last-deploy-org.txt" 2>/dev/null)
fi

# If no state marker, try to extract from agent error output
if [ -z "$TARGET_ORG" ]; then
    TARGET_ORG=$(printf '%s' "$INPUT" | jq -r '.error // .result // ""' 2>/dev/null | grep -oP '(?:--target-org\s+|-o\s+)\K\S+' 2>/dev/null | head -1 || echo "")
fi

[ -z "$TARGET_ORG" ] && exit 0

# Check for orphaned deployment (8s timeout for hook budget)
REPORT=$(timeout 8 sf project deploy report --use-most-recent --target-org "$TARGET_ORG" --json 2>/dev/null || echo "")
[ -z "$REPORT" ] && exit 0

STATUS=$(printf '%s' "$REPORT" | jq -r '.result.status // empty' 2>/dev/null)
JOB_ID=$(printf '%s' "$REPORT" | jq -r '.result.id // empty' 2>/dev/null)

case "$STATUS" in
    InProgress|Queued|Pending)
        jq -nc --arg status "$STATUS" --arg jobId "$JOB_ID" --arg org "$TARGET_ORG" '{
            suppressOutput: true,
            hookSpecificOutput: {
                hookEventName: "SubagentStop",
                additionalContext: ("DEPLOY RECOVERY NEEDED: The deployment manager stopped while a deployment was " + $status + " on " + $org + ".\n\nJob ID: " + $jobId + "\nCheck status: sf project deploy report --job-id " + $jobId + " --target-org " + $org + "\nCancel: sf project deploy cancel --job-id " + $jobId + " --target-org " + $org + "\n\nThe deployment is still running in Salesforce. You should either wait for it to complete or cancel it before starting a new deployment.")
            }
        }'
        ;;
esac

exit 0
