#!/usr/bin/env bash
#
# post-update-deferred-runner.sh - Run a single deferred post-update task
#
# Called by session-start-post-update.sh with a step key (e.g., "step7").
# Delegates to finish-opspal-update.sh --single-step for execution,
# then atomically updates the deferred tasks JSON.
#
# Usage: post-update-deferred-runner.sh <step-key> [--workspace <path>]
#
# Exit codes:
#   0 = task completed successfully
#   1 = task failed or not found in pending list

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FINISH_SCRIPT="$SCRIPT_DIR/../finish-opspal-update.sh"
DEFERRED_FILE="${HOME}/.claude/session-context/post-update-deferred-tasks.json"

STEP_KEY="${1:-}"
shift || true

WORKSPACE_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace) WORKSPACE_ARG="$2"; shift 2 ;;
    --workspace=*) WORKSPACE_ARG="${1#*=}"; shift ;;
    *) shift ;;
  esac
done

if [ -z "$STEP_KEY" ]; then
  echo "Usage: post-update-deferred-runner.sh <step-key>" >&2
  exit 1
fi

if [ ! -f "$DEFERRED_FILE" ]; then
  echo "No deferred tasks file found" >&2
  exit 1
fi

if [ ! -f "$FINISH_SCRIPT" ]; then
  echo "finish-opspal-update.sh not found at $FINISH_SCRIPT" >&2
  exit 1
fi

# Verify step is in pendingTasks
if ! command -v node &>/dev/null; then
  echo "Node.js not available" >&2
  exit 1
fi

IS_PENDING=$(node -e "
  const fs = require('fs');
  try {
    const d = JSON.parse(fs.readFileSync('$DEFERRED_FILE', 'utf8'));
    console.log((d.pendingTasks || []).includes('$STEP_KEY') ? 'yes' : 'no');
  } catch { console.log('no'); }
" 2>/dev/null) || IS_PENDING="no"

if [ "$IS_PENDING" != "yes" ]; then
  exit 0  # Not pending — silently skip (may have been completed by another run)
fi

# Run the step via finish-opspal-update.sh --single-step
FINISH_ARGS=(--single-step "$STEP_KEY" --no-pull --skip-fix)
[ -n "$WORKSPACE_ARG" ] && FINISH_ARGS+=(--workspace "$WORKSPACE_ARG")

STEP_EXIT=0
bash "$FINISH_SCRIPT" "${FINISH_ARGS[@]}" >/dev/null 2>&1 || STEP_EXIT=$?

if [ "$STEP_EXIT" -eq 0 ]; then
  # Move from pendingTasks to completedTasks
  node -e "
    const fs = require('fs');
    const f = '$DEFERRED_FILE';
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      d.pendingTasks = (d.pendingTasks || []).filter(t => t !== '$STEP_KEY');
      d.completedTasks = d.completedTasks || [];
      if (!d.completedTasks.includes('$STEP_KEY')) d.completedTasks.push('$STEP_KEY');
      fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n', 'utf8');
    } catch {}
  " 2>/dev/null || true
fi

exit $STEP_EXIT
