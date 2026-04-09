#!/usr/bin/env bash
#
# session-start-post-update.sh - Auto-run safe post-update tasks on version change
#
# Called by session-start-dispatcher.sh as Phase 7.
# Detects plugin version changes via post-update-version-snapshot.js,
# then runs lightweight deferred tasks (CLAUDE.md sync, stale hook cleanup, etc.)
# within a strict time budget.
#
# Opt-out: export ENABLE_POST_UPDATE_AUTO=0
#
# Time budget: 8 seconds total for all tasks.
# No-change sessions cost ~0.3s (just the detect check).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SNAPSHOT_SCRIPT="$PLUGIN_ROOT/scripts/lib/post-update-version-snapshot.js"
DEFERRED_RUNNER="$PLUGIN_ROOT/scripts/lib/post-update-deferred-runner.sh"
DEFERRED_FILE="${HOME}/.claude/session-context/post-update-deferred-tasks.json"

# Read stdin (required by dispatcher contract)
cat 2>/dev/null >/dev/null || true

# Opt-out check
if [ "${ENABLE_POST_UPDATE_AUTO:-1}" = "0" ]; then
  printf '{}\n'
  exit 0
fi

# Prerequisite checks — fail silently
if ! command -v node &>/dev/null; then
  printf '{}\n'
  exit 0
fi

if [ ! -f "$SNAPSHOT_SCRIPT" ]; then
  printf '{}\n'
  exit 0
fi

if [ ! -f "$DEFERRED_RUNNER" ]; then
  printf '{}\n'
  exit 0
fi

# =========================================================================
# Phase 1: Detect version changes (2s budget)
# =========================================================================

DETECT_OUTPUT=""
if [ ! -f "$DEFERRED_FILE" ]; then
  DETECT_OUTPUT=$(timeout 2 node "$SNAPSHOT_SCRIPT" --mode detect 2>/dev/null) || true
fi

# Check if we have deferred tasks to process
if [ ! -f "$DEFERRED_FILE" ]; then
  # No changes detected and no deferred tasks
  printf '{}\n'
  exit 0
fi

# =========================================================================
# Phase 2: Run deferred tasks within time budget
# =========================================================================

TOTAL_BUDGET=8
START_TIME=$(date +%s)
COMPLETED_TASKS=()
SKIPPED_TASKS=()
WORKSPACE_ROOT="${PWD}"

# Task order: highest priority first
# step7 = CLAUDE.md sync (most requested automation)
TASK_ORDER=("step7" "step2" "step4" "step8" "step9" "step10" "step11")

# Per-task timeout budgets (seconds)
declare -A TASK_BUDGETS=(
  [step7]=3
  [step2]=2
  [step4]=2
  [step8]=1
  [step9]=1
  [step10]=1
  [step11]=1
)

for task in "${TASK_ORDER[@]}"; do
  # Check wall clock budget
  ELAPSED=$(( $(date +%s) - START_TIME ))
  if [ "$ELAPSED" -ge "$TOTAL_BUDGET" ]; then
    SKIPPED_TASKS+=("$task")
    continue
  fi

  # Check opt-out for specific tasks
  if [ "$task" = "step7" ] && [ "${ENABLE_POST_UPDATE_CLAUDEMD:-1}" = "0" ]; then
    SKIPPED_TASKS+=("$task")
    continue
  fi

  BUDGET="${TASK_BUDGETS[$task]:-2}"
  REMAINING=$(( TOTAL_BUDGET - ELAPSED ))
  [ "$BUDGET" -gt "$REMAINING" ] && BUDGET="$REMAINING"

  if timeout "$BUDGET" bash "$DEFERRED_RUNNER" "$task" --workspace "$WORKSPACE_ROOT" 2>/dev/null; then
    COMPLETED_TASKS+=("$task")
  else
    SKIPPED_TASKS+=("$task")
  fi
done

# =========================================================================
# Phase 3: Snapshot baseline if all tasks completed
# =========================================================================

# Check if any pending tasks remain
PENDING_COUNT=0
if [ -f "$DEFERRED_FILE" ]; then
  PENDING_COUNT=$(node -e "
    const fs = require('fs');
    try {
      const d = JSON.parse(fs.readFileSync('$DEFERRED_FILE', 'utf8'));
      console.log((d.pendingTasks || []).length);
    } catch { console.log(0); }
  " 2>/dev/null) || PENDING_COUNT=0
fi

if [ "$PENDING_COUNT" -eq 0 ] || [ "$PENDING_COUNT" = "0" ]; then
  # All tasks done — update version snapshot baseline
  timeout 2 node "$SNAPSHOT_SCRIPT" --mode snapshot >/dev/null 2>&1 || true
  # Clean up deferred file
  rm -f "$DEFERRED_FILE" 2>/dev/null || true
fi

# =========================================================================
# Phase 4: Emit systemMessage
# =========================================================================

TASK_LABELS=""
declare -A STEP_NAMES=(
  [step7]="CLAUDE.md sync"
  [step2]="stale hook cleanup"
  [step4]="cache prune"
  [step8]="routing verification"
  [step9]="sub-agent remediation"
  [step10]="customization migration"
  [step11]="runbook check"
)

if [ "${#COMPLETED_TASKS[@]}" -gt 0 ]; then
  LABELS=()
  for t in "${COMPLETED_TASKS[@]}"; do
    LABELS+=("${STEP_NAMES[$t]:-$t}")
  done
  TASK_LABELS=$(IFS=", "; echo "${LABELS[*]}")
fi

MSG=""
# Check if CLAUDE.md sync was deferred (pending review exists)
CLAUDEMD_DEFERRED=0
PENDING_DIR="$HOME/.claude/opspal/claudemd-pending"
if [ -d "$PENDING_DIR" ] && ls "$PENDING_DIR"/*.json >/dev/null 2>&1; then
  CLAUDEMD_DEFERRED=1
fi

if [ "${#COMPLETED_TASKS[@]}" -gt 0 ]; then
  if [ "$CLAUDEMD_DEFERRED" = "1" ]; then
    MSG="Post-update: CLAUDE.md sync paused — custom content needs review. Run /sync-claudemd to merge safely."
  else
    MSG="Post-update auto-applied: ${TASK_LABELS}."
  fi
fi

if [ "$PENDING_COUNT" -gt 0 ] 2>/dev/null && [ "$PENDING_COUNT" != "0" ]; then
  MSG="${MSG:+$MSG }Run /finishopspalupdate for full validation (npm, routing rebuild, hook health)."
elif [ "${#COMPLETED_TASKS[@]}" -gt 0 ]; then
  MSG="${MSG} Run /finishopspalupdate for full validation if needed."
fi

if [ -n "$MSG" ]; then
  printf '{"suppressOutput":true,"systemMessage":"%s"}\n' "$(echo "$MSG" | sed 's/"/\\"/g')"
else
  printf '{}\n'
fi

exit 0
