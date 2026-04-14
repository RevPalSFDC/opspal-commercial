#!/usr/bin/env bash
# STATUS: SUPERSEDED — called as child by a registered dispatcher hook
# pre-deploy-queued-check.sh
# Advisory check for in-progress or queued deployments on the target org.
# Emits a warning if another deployment is active — never blocks execution.
#
# Called by pre-bash-dispatcher.sh via run_child_hook() before deploy commands.
# Exit code: always 0 (notification hook, never blocks).

set +e
trap '' ERR

if ! command -v jq &>/dev/null; then
    exit 0
fi

# Standalone guard — skip when run outside dispatcher context
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  exit 0
fi

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$COMMAND" ] && exit 0

# Extract target org from command flags
TARGET_ORG=$(printf '%s' "$COMMAND" | grep -oP '(?:--target-org\s+|-o\s+)\K\S+' 2>/dev/null || echo "")
[ -z "$TARGET_ORG" ] && exit 0

# --- Check 1: In-progress or queued deployment on this org ---
# Use an 8-second timeout to stay within hook budget
REPORT=$(timeout 8 sf project deploy report --use-most-recent --target-org "$TARGET_ORG" --json 2>/dev/null || echo "")

if [ -n "$REPORT" ]; then
  STATUS=$(printf '%s' "$REPORT" | jq -r '.result.status // empty' 2>/dev/null)
  JOB_ID=$(printf '%s' "$REPORT" | jq -r '.result.id // "unknown"' 2>/dev/null)

  case "$STATUS" in
    InProgress|Queued|Pending)
      jq -nc --arg status "$STATUS" --arg jobId "$JOB_ID" --arg org "$TARGET_ORG" '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: ("WARNING: A deployment is already " + $status + " on " + $org + " (job: " + $jobId + "). Your deployment may queue behind it or fail with a metadata lock.\n\nOptions:\n1. Check status: sf project deploy report --job-id " + $jobId + " --target-org " + $org + "\n2. Cancel it: sf project deploy cancel --job-id " + $jobId + " --target-org " + $org + "\n3. Proceed anyway — Salesforce will queue yours behind the active one")
        }
      }'
      ;;
  esac
fi

# --- Check 2: Recent SOQL field errors that may affect this deployment ---
MARKER_DIR="${PROJECT_ROOT:-.}/.claude/deploy-error-state"
MARKER="$MARKER_DIR/last-field-error.json"
if [ -f "$MARKER" ]; then
  ERROR_TS=$(jq -r '.timestamp // "0"' "$MARKER" 2>/dev/null)
  NOW=$(date +%s)
  AGE=$((NOW - ERROR_TS))
  if [ "$AGE" -lt 300 ]; then
    OBJ=$(jq -r '.object // "unknown"' "$MARKER" 2>/dev/null)
    jq -nc --arg obj "$OBJ" --arg age "${AGE}s" '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: ("WARNING: A SOQL field error occurred on " + $obj + " " + $age + " ago. If this deployment references the same object/field, it may fail. Verify the field exists before deploying.")
      }
    }'
  fi
fi

exit 0
